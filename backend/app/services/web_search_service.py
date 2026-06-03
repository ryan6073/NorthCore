import asyncio
import hashlib
import html
from html.parser import HTMLParser
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.config import settings
from app.core.llm_client import client
from app.database import get_web_search_cache, upsert_web_search_cache


VALID_WEB_SEARCH_MODES = {"auto", "force", "off"}
NO_SEARCH_MARKERS = (
    "翻译", "译成", "总结", "润色", "改写", "解释", "什么意思", "含义",
    "分析这段", "review 这段", "代码含义", "方案讨论", "架构分析",
    "translate", "summarize", "rewrite", "explain", "what does this code",
    "review this code", "analyze this code",
)
FRESHNESS_MARKERS = (
    "最新", "现在", "目前", "今天", "昨日", "昨天", "实时", "新闻", "价格",
    "股价", "版本", "发布", "官网", "文档", "当前", "最近", "政策", "法规",
    "latest", "current", "currently", "today", "yesterday", "news", "price",
    "version", "release", "released", "documentation", "docs", "official",
    "status", "now",
)
SKIPPED_HTML_TAGS = {"script", "style", "noscript", "svg", "canvas", "header", "footer", "nav", "aside"}
BLOCK_HTML_TAGS = {
    "address", "article", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption",
    "figure", "h1", "h2", "h3", "h4", "h5", "h6", "li", "main", "ol", "p", "pre",
    "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
}
PRIORITY_HTML_TAGS = {"main", "article"}
HEADING_HTML_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
CAPTURE_HTML_TAGS = HEADING_HTML_TAGS | {"p", "li", "pre", "blockquote", "td", "th", "figcaption"}

WEB_SEARCH_DECISION_PROMPT = """你是 AgentHub 的联网搜索决策器。
只判断这条普通聊天消息是否需要联网搜索，并在需要时生成搜索 query。

直接返回 JSON，不要 Markdown：
{
  "shouldSearch": true,
  "query": "简洁搜索词",
  "reason": "一句话原因"
}

规则：
- 需要搜索：最新信息、当前状态、新闻、价格、版本、发布日期、库/框架文档、外部事实核验。
- 不搜索：闲聊、翻译、总结、润色、解释代码含义、方案讨论、基于已有上下文的分析。
"""


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _setting_int(name: str, default: int) -> int:
    try:
        return int(getattr(settings, name, default))
    except (TypeError, ValueError):
        return default


def _safe_body(value: str) -> str:
    max_chars = max(0, _setting_int("WEB_SEARCH_BODY_MAX_CHARS", 500))
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if max_chars and len(text) > max_chars:
        return text[:max_chars].rstrip() + "..."
    return text


def _safe_search_query(value: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    max_chars = max(1, _setting_int("WEB_SEARCH_QUERY_MAX_CHARS", 300))
    query = re.sub(r"\s+", " ", str(value or "")).strip()
    if metadata is not None:
        metadata["originalQueryLength"] = max(int(metadata.get("originalQueryLength") or 0), len(query))
    if len(query) <= max_chars:
        return query
    if metadata is not None:
        metadata["queryTruncated"] = True
    return query[:max_chars].rstrip()


def normalize_web_search_mode(payload: Optional[Dict[str, Any]]) -> str:
    if not isinstance(payload, dict):
        return "auto"
    mode = str(payload.get("webSearchMode") or "auto").strip().lower()
    return mode if mode in VALID_WEB_SEARCH_MODES else "auto"


def normalize_web_search_provider() -> str:
    provider = str(getattr(settings, "WEB_SEARCH_PROVIDER", "ddgs") or "ddgs").strip().lower()
    if provider in {"ddgs", "duckduckgo"}:
        return "ddgs"
    return provider or "ddgs"


def _default_metadata(mode: str) -> Dict[str, Any]:
    return {
        "shouldSearch": False,
        "decisionReason": "",
        "mode": mode,
        "used": False,
        "provider": normalize_web_search_provider(),
        "query": "",
        "cacheHit": False,
        "results": [],
        "queryTruncated": False,
        "originalQueryLength": 0,
        "contextTruncated": False,
        "contextChars": 0,
        "fetchedPages": [],
        "error": None,
    }


def _parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


def _heuristic_search_gate(content: str) -> Tuple[str, str]:
    text = (content or "").strip()
    lowered = text.lower()
    has_freshness_marker = any(marker in text or marker in lowered for marker in FRESHNESS_MARKERS)
    if has_freshness_marker:
        return "maybe", "消息涉及当前/外部事实，进入联网搜索判断"
    if any(marker in text or marker in lowered for marker in NO_SEARCH_MARKERS):
        return "no", "消息属于解释、翻译、总结、方案讨论或代码分析，直接不搜索"
    return "no", "未发现需要联网确认的时效性或外部事实需求"


async def decide_web_search_for_chat(
    content: str,
    payload: Optional[Dict[str, Any]] = None,
    conversation: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    mode = normalize_web_search_mode(payload)
    metadata = _default_metadata(mode)
    if not getattr(settings, "WEB_SEARCH_ENABLED", True):
        metadata["decisionReason"] = "联网搜索配置已关闭"
        return metadata
    if mode == "off":
        metadata["decisionReason"] = "payload.webSearchMode=off"
        return metadata

    clean_content = (content or "").strip()
    if not clean_content:
        metadata["decisionReason"] = "消息内容为空"
        return metadata
    if mode == "force":
        metadata.update({
            "shouldSearch": True,
            "decisionReason": "payload.webSearchMode=force",
            "query": _safe_search_query(clean_content, metadata),
        })
        return metadata

    gate, reason = _heuristic_search_gate(clean_content)
    if gate == "no":
        metadata["decisionReason"] = reason
        return metadata

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.MODEL_EP,
            messages=[
                {"role": "system", "content": WEB_SEARCH_DECISION_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "conversationMode": conversation.get("mode") if conversation else None,
                            "userMessage": clean_content,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            stream=False,
        )
        payload = _parse_json_object(response.choices[0].message.content or "")
        should_search = bool(payload.get("shouldSearch"))
        query = str(payload.get("query") or clean_content).strip() or clean_content
        metadata.update({
            "shouldSearch": should_search,
            "decisionReason": str(payload.get("reason") or reason),
            "query": _safe_search_query(query, metadata) if should_search else "",
        })
    except Exception:
        metadata.update({
            "shouldSearch": True,
            "decisionReason": f"{reason}；模型判断失败，使用原消息作为搜索词",
            "query": _safe_search_query(clean_content, metadata),
        })
    return metadata


class DuckDuckGoDdgsProvider:
    name = "ddgs"

    def search(
        self,
        query: str,
        max_results: int,
        region: str,
        safesearch: str,
        timeout_seconds: int,
    ) -> List[Dict[str, str]]:
        try:
            from ddgs import DDGS
        except ImportError as exc:
            raise RuntimeError("ddgs package is not installed") from exc

        try:
            ddgs = DDGS(timeout=timeout_seconds)
        except TypeError:
            ddgs = DDGS()
        try:
            raw_results = list(
                ddgs.text(
                    query,
                    region=region or "wt-wt",
                    safesearch=safesearch or "moderate",
                    max_results=max_results,
                )
            )
        finally:
            close = getattr(ddgs, "close", None)
            if callable(close):
                close()
        return [_normalize_provider_result(item) for item in raw_results]


def _normalize_provider_result(item: Any) -> Dict[str, str]:
    if not isinstance(item, dict):
        return {"title": "", "body": "", "href": ""}
    href = str(item.get("href") or item.get("url") or "").strip()
    return {
        "title": str(item.get("title") or "").strip(),
        "body": _safe_body(str(item.get("body") or item.get("snippet") or "")),
        "href": href,
    }


class _ReadableTextHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.priority_depth = 0
        self.in_title = False
        self.title_parts: List[str] = []
        self.parts: List[str] = []
        self.priority_parts: List[str] = []
        self.blocks: List[Dict[str, Any]] = []
        self.current_block_tag: Optional[str] = None
        self.current_block_priority = False
        self.current_block_parts: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if tag in SKIPPED_HTML_TAGS:
            self._flush_block()
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "title":
            self.in_title = True
        if tag in PRIORITY_HTML_TAGS:
            self.priority_depth += 1
        if tag in BLOCK_HTML_TAGS:
            if tag in CAPTURE_HTML_TAGS:
                self._start_block(tag)
            self._append("\n")
        if tag == "a":
            href = next((value for name, value in attrs if name.lower() == "href" and value), "")
            if href:
                self._append(f" ({href}) ", include_current=True)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIPPED_HTML_TAGS and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag == "title":
            self.in_title = False
        if tag in PRIORITY_HTML_TAGS and self.priority_depth:
            self.priority_depth -= 1
        if tag in BLOCK_HTML_TAGS:
            if tag == self.current_block_tag:
                self._flush_block()
            self._append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        clean = html.unescape(data or "").strip()
        if not clean:
            return
        if self.in_title:
            self.title_parts.append(clean)
            return
        self._append(clean, include_current=True)

    def _start_block(self, tag: str) -> None:
        self._flush_block()
        self.current_block_tag = tag
        self.current_block_priority = self.priority_depth > 0
        self.current_block_parts = []

    def _flush_block(self) -> None:
        if not self.current_block_tag:
            return
        text = _normalize_text(" ".join(self.current_block_parts))
        if text:
            block: Dict[str, Any] = {
                "tag": self.current_block_tag,
                "text": text,
                "priority": self.current_block_priority,
            }
            if self.current_block_tag in HEADING_HTML_TAGS:
                block["level"] = int(self.current_block_tag[1])
            self.blocks.append(block)
        self.current_block_tag = None
        self.current_block_priority = False
        self.current_block_parts = []

    def _append(self, value: str, include_current: bool = False) -> None:
        target = self.priority_parts if self.priority_depth else self.parts
        target.append(value)
        if include_current and self.current_block_tag:
            self.current_block_parts.append(value)

    def readable_text(self) -> Tuple[str, str, List[Dict[str, Any]]]:
        self._flush_block()
        title = _normalize_text(" ".join(self.title_parts))
        priority_blocks = [block for block in self.blocks if block.get("priority")]
        selected_blocks = priority_blocks or self.blocks
        block_text = _normalize_extracted_text("\n\n".join(str(block.get("text") or "") for block in selected_blocks))
        priority_text = _normalize_extracted_text(" ".join(self.priority_parts))
        body_text = block_text or priority_text or _normalize_extracted_text(" ".join(self.parts))
        if title and title not in body_text[:500]:
            body_text = f"{title}\n\n{body_text}".strip()
        return title, body_text, selected_blocks


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_extracted_text(value: str) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_readable_text(html_text: str, url: str = "") -> Dict[str, Any]:
    parser = _ReadableTextHTMLParser()
    try:
        parser.feed(html_text or "")
        title, text, blocks = parser.readable_text()
    except Exception:
        title = ""
        text = _normalize_extracted_text(re.sub(r"<[^>]+>", " ", html_text or ""))
        blocks = []
    return {
        "title": title,
        "text": text,
        "href": url,
        "blocks": blocks,
    }


def _question_terms(question: str) -> Set[str]:
    terms = set()
    for token in re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_+#./-]{2,}", str(question or "").lower()):
        if token in {"http", "https", "www"}:
            continue
        terms.add(token)
    return terms


def _split_text_blocks(text: str) -> List[str]:
    raw_blocks = re.split(r"\n{2,}|(?<=[。！？.!?])\s+", str(text or ""))
    blocks = []
    for block in raw_blocks:
        clean = _normalize_text(block)
        if len(clean) >= 20:
            blocks.append(clean)
    return blocks or [_normalize_text(text)]


def select_relevant_chunks(text: str, question: str, budget: int) -> Tuple[str, bool]:
    budget = max(0, int(budget or 0))
    clean_text = _normalize_extracted_text(text)
    if not budget or len(clean_text) <= budget:
        return clean_text[:budget] if budget else "", len(clean_text) > budget if budget else bool(clean_text)
    terms = _question_terms(question)
    blocks = _split_text_blocks(clean_text)
    scored: List[Tuple[int, int, str]] = []
    for index, block in enumerate(blocks):
        lowered = block.lower()
        score = sum(lowered.count(term) for term in terms)
        if index < 2:
            score += 1
        scored.append((score, index, block))
    if terms:
        candidates = sorted(scored, key=lambda item: (-item[0], item[1]))
    else:
        candidates = scored
    selected: List[Tuple[int, str]] = []
    used = 0
    for score, index, block in candidates:
        if score <= 0 and selected:
            continue
        remaining = budget - used
        if remaining <= 0:
            break
        candidate = block if len(block) <= remaining else block[:remaining].rstrip() + "..."
        selected.append((index, candidate))
        used += len(candidate) + 2
    if not selected:
        return clean_text[:budget].rstrip() + "...", True
    selected.sort(key=lambda item: item[0])
    return "\n\n".join(block for _, block in selected).strip(), True


def _score_against_question(text: str, terms: Set[str], index: int = 0) -> int:
    lowered = str(text or "").lower()
    score = sum(lowered.count(term) for term in terms)
    if index < 3:
        score += 1
    return score


def _format_html_block(block: Dict[str, Any]) -> str:
    tag = str(block.get("tag") or "").lower()
    text = _normalize_text(str(block.get("text") or ""))
    if not text:
        return ""
    if tag in HEADING_HTML_TAGS:
        level = _clamp(int(block.get("level") or int(tag[1])), 1, 6)
        return f"{'#' * level} {text}"
    if tag == "li":
        return f"- {text}"
    if tag in {"td", "th"}:
        return f"表格: {text}"
    if tag == "pre":
        return f"代码/预格式文本: {text}"
    if tag == "blockquote":
        return f"引用: {text}"
    return text


def simplify_html_tree(blocks: List[Dict[str, Any]], question: str, budget: int) -> Tuple[str, bool]:
    budget = max(0, int(budget or 0))
    if not budget or not blocks:
        return "", bool(blocks)
    terms = _question_terms(question)
    heading_stack: Dict[int, str] = {}
    entries: List[Tuple[int, int, str]] = []
    for index, block in enumerate(blocks):
        tag = str(block.get("tag") or "").lower()
        formatted = _format_html_block(block)
        if not formatted:
            continue
        if tag in HEADING_HTML_TAGS:
            level = _clamp(int(block.get("level") or int(tag[1])), 1, 6)
            heading_stack = {k: v for k, v in heading_stack.items() if k < level}
            heading_stack[level] = _normalize_text(str(block.get("text") or ""))
            score = _score_against_question(formatted, terms, index) + 3
            entries.append((score, index, formatted))
            continue
        heading_path = " > ".join(heading_stack[k] for k in sorted(heading_stack))
        text_for_score = f"{heading_path}\n{formatted}" if heading_path else formatted
        score = _score_against_question(text_for_score, terms, index)
        if block.get("priority"):
            score += 1
        entry = f"[{heading_path}]\n{formatted}" if heading_path else formatted
        entries.append((score, index, entry))
    if not entries:
        return "", True

    selected: List[Tuple[int, str]] = []
    used = 0
    candidates = sorted(entries, key=lambda item: (-item[0], item[1])) if terms else entries
    for score, index, entry in candidates:
        if score <= 0 and selected:
            continue
        remaining = budget - used
        if remaining <= 0:
            break
        piece = entry if len(entry) <= remaining else entry[:remaining].rstrip() + "..."
        selected.append((index, piece))
        used += len(piece) + 2
    if not selected:
        first_entry = entries[0][2]
        return first_entry[:budget].rstrip() + "...", True
    selected.sort(key=lambda item: item[0])
    text = "\n\n".join(piece for _, piece in selected).strip()
    return text, len(selected) < len(entries) or len(text) >= budget


def compress_page_content(
    text: str,
    question: str,
    budget: int,
    blocks: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[str, Dict[str, bool]]:
    budget = max(0, int(budget or 0))
    clean_text = _normalize_extracted_text(text)
    flags = {
        "pageTruncated": False,
        "structureCompressed": False,
        "chunkSelected": False,
    }
    if not budget:
        flags["pageTruncated"] = bool(clean_text)
        return "", flags
    if len(clean_text) <= budget:
        return clean_text, flags

    flags["pageTruncated"] = True
    if blocks:
        tree_budget = min(len(clean_text), max(budget + 1000, budget * 2))
        simplified, structure_truncated = simplify_html_tree(blocks, question, tree_budget)
        if simplified:
            flags["structureCompressed"] = True
            flags["pageTruncated"] = flags["pageTruncated"] or structure_truncated
            if len(simplified) <= budget:
                return simplified, flags
            chunk, _ = select_relevant_chunks(simplified, question, budget)
            flags["chunkSelected"] = True
            return chunk, flags

    chunk, _ = select_relevant_chunks(clean_text, question, budget)
    flags["chunkSelected"] = True
    return chunk, flags


def _decode_response_body(data: bytes, content_type: str) -> str:
    charset_match = re.search(r"charset=([A-Za-z0-9_.-]+)", content_type or "", re.IGNORECASE)
    charset = charset_match.group(1) if charset_match else "utf-8"
    try:
        return data.decode(charset, errors="replace")
    except LookupError:
        return data.decode("utf-8", errors="replace")


def _fetch_page_sync(url: str, timeout_seconds: int, max_bytes: int) -> Dict[str, Any]:
    parsed = urlparse(str(url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return {"href": url, "status": "skipped", "error": "仅支持 http/https URL", "text": "", "title": ""}
    request = Request(
        url,
        headers={
            "User-Agent": "NorthCoreAgentHub/1.0 (+https://northcore.ai)",
            "Accept": "text/html,text/plain;q=0.9,*/*;q=0.3",
        },
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        content_type = str(response.headers.get("content-type") or "")
        lowered_type = content_type.lower()
        if lowered_type and not any(kind in lowered_type for kind in ("text/html", "text/plain", "application/xhtml")):
            return {"href": url, "status": "skipped", "error": f"不支持的内容类型: {content_type}", "text": "", "title": ""}
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            data = data[:max_bytes]
            truncated = True
        else:
            truncated = False
        raw_text = _decode_response_body(data, content_type)
        if "text/plain" in lowered_type:
            title = parsed.netloc
            text = _normalize_extracted_text(raw_text)
            blocks: List[Dict[str, Any]] = []
        else:
            extracted = extract_readable_text(raw_text, url)
            title = extracted["title"] or parsed.netloc
            text = extracted["text"]
            blocks = list(extracted.get("blocks") or [])
        return {
            "href": url,
            "status": "fetched",
            "title": title,
            "text": text,
            "blocks": blocks,
            "contentChars": len(text),
            "downloadTruncated": truncated,
            "error": None,
        }


async def fetch_search_result_pages(results: List[Dict[str, Any]], question: str) -> List[Dict[str, Any]]:
    max_pages = _clamp(_setting_int("WEB_SEARCH_FETCH_MAX_RESULTS", 3), 0, 5)
    if max_pages <= 0:
        return []
    timeout_seconds = max(1, _setting_int("WEB_SEARCH_FETCH_TIMEOUT_SECONDS", _setting_int("WEB_SEARCH_TIMEOUT_SECONDS", 8)))
    max_bytes = max(1024, _setting_int("WEB_SEARCH_FETCH_MAX_BYTES", 1000000))
    pages: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for result in results:
        href = str(result.get("href") or "").strip()
        if not href or href in seen:
            continue
        seen.add(href)
        try:
            page = await asyncio.wait_for(
                asyncio.to_thread(_fetch_page_sync, href, timeout_seconds, max_bytes),
                timeout=timeout_seconds + 1,
            )
        except Exception as exc:
            page = {
                "href": href,
                "status": "error",
                "title": str(result.get("title") or ""),
                "text": "",
                "contentChars": 0,
                "downloadTruncated": False,
                "error": str(exc),
            }
        if not page.get("title"):
            page["title"] = str(result.get("title") or "")
        if page.get("status") == "fetched" and page.get("text"):
            original_chars = len(str(page.get("text") or ""))
            page_text, compression_flags = compress_page_content(
                str(page.get("text") or ""),
                question,
                max(500, _setting_int("WEB_SEARCH_PAGE_MAX_CHARS", 12000)),
                blocks=list(page.get("blocks") or []),
            )
            page["text"] = page_text
            page["contentChars"] = original_chars
            page.update(compression_flags)
            page.pop("blocks", None)
        pages.append(page)
        if len([item for item in pages if item.get("status") == "fetched"]) >= max_pages:
            break
        if len(pages) >= max_pages:
            break
    return pages


def _cache_key(provider: str, query: str, max_results: int, region: str, safesearch: str) -> str:
    payload = json.dumps(
        {
            "provider": provider,
            "query": query,
            "maxResults": max_results,
            "region": region,
            "safesearch": safesearch,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _parse_db_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _cache_is_fresh(cache_row: Dict[str, Any]) -> bool:
    updated_at = _parse_db_time(cache_row.get("updatedAt"))
    if not updated_at:
        return False
    ttl = max(0, _setting_int("WEB_SEARCH_CACHE_TTL_SECONDS", 3600))
    if ttl == 0:
        return False
    return (datetime.now() - updated_at).total_seconds() <= ttl


async def search_web(query: str, max_results: Optional[int] = None) -> Dict[str, Any]:
    provider = normalize_web_search_provider()
    if provider != "ddgs":
        raise ValueError(f"不支持的联网搜索 provider: {provider}")
    query = _safe_search_query(query)
    max_results = _clamp(int(max_results or _setting_int("WEB_SEARCH_MAX_RESULTS", 10)), 1, 10)
    region = str(getattr(settings, "WEB_SEARCH_REGION", "wt-wt") or "wt-wt").strip()
    safesearch = str(getattr(settings, "WEB_SEARCH_SAFESEARCH", "moderate") or "moderate").strip()
    cache_key = _cache_key(provider, query, max_results, region, safesearch)
    cached = get_web_search_cache(cache_key)
    if cached and _cache_is_fresh(cached):
        return {
            "provider": provider,
            "query": query,
            "cacheHit": True,
            "results": list(cached.get("results") or [])[:max_results],
        }

    timeout_seconds = max(1, _setting_int("WEB_SEARCH_TIMEOUT_SECONDS", 8))
    adapter = DuckDuckGoDdgsProvider()
    raw_results = await asyncio.wait_for(
        asyncio.to_thread(adapter.search, query, max_results, region, safesearch, timeout_seconds),
        timeout=timeout_seconds,
    )
    results = [
        item for item in raw_results
        if item.get("href") and (item.get("title") or item.get("body"))
    ][:max_results]
    upsert_web_search_cache(
        cache_key=cache_key,
        provider=provider,
        query=query,
        max_results=max_results,
        region=region,
        safesearch=safesearch,
        results=results,
    )
    return {
        "provider": provider,
        "query": query,
        "cacheHit": False,
        "results": results,
    }


def _public_fetched_pages(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    public = []
    for page in pages:
        public.append({
            "title": page.get("title") or "",
            "href": page.get("href") or "",
            "status": page.get("status") or "",
            "contentChars": int(page.get("contentChars") or len(page.get("text") or "")),
            "usedChars": int(page.get("usedChars") or 0),
            "downloadTruncated": bool(page.get("downloadTruncated")),
            "pageTruncated": bool(page.get("pageTruncated")),
            "structureCompressed": bool(page.get("structureCompressed")),
            "chunkSelected": bool(page.get("chunkSelected")),
            "error": page.get("error"),
        })
    return public


def build_web_search_context(web_search: Dict[str, Any]) -> str:
    results = list(web_search.get("results") or [])
    if not results:
        return ""
    limit = _clamp(_setting_int("WEB_SEARCH_CONTEXT_MAX_RESULTS", 5), 1, 5)
    total_budget = max(1000, _setting_int("WEB_SEARCH_CONTEXT_MAX_CHARS", 30000))
    per_page_budget = max(500, _setting_int("WEB_SEARCH_PAGE_MAX_CHARS", 12000))
    pages = list(web_search.get("_fetchedPages") or [])
    pages_by_href = {
        str(page.get("href") or ""): page
        for page in pages
        if page.get("status") == "fetched" and page.get("text")
    }
    lines = [
        "[联网搜索结果]",
        "以下结果只供本轮回答参考。只能引用下列实际存在的 URL；不要编造 URL。",
        "如果回答使用搜索信息，必须在相关结论旁标注来源 URL。",
    ]
    remaining_budget = total_budget - len("\n".join(lines))
    context_truncated = False
    for index, item in enumerate(results[:limit], start=1):
        if remaining_budget <= 0:
            context_truncated = True
            break
        href = str(item.get("href") or "")
        page = pages_by_href.get(href)
        source_text = ""
        source_label = "摘要"
        if page:
            budget = min(per_page_budget, max(0, remaining_budget - 180))
            source_text, was_truncated = select_relevant_chunks(str(page.get("text") or ""), str(web_search.get("query") or ""), budget)
            page["usedChars"] = len(source_text)
            context_truncated = (
                context_truncated
                or was_truncated
                or bool(page.get("downloadTruncated"))
                or bool(page.get("pageTruncated"))
            )
            source_label = "正文摘录"
        if not source_text:
            source_text = str(item.get("body") or "")
            source_label = "摘要"
        block = "\n".join([
            f"{index}. {item.get('title') or (page or {}).get('title') or 'Untitled'}",
            f"{source_label}: {source_text}",
            f"URL: {href}",
        ])
        if len(block) > remaining_budget:
            block = block[:remaining_budget].rstrip() + "..."
            context_truncated = True
        lines.append(block)
        remaining_budget -= len(block) + 1
    context = "\n".join(lines)
    web_search["contextChars"] = len(context)
    web_search["contextTruncated"] = bool(context_truncated or len(context) >= total_budget)
    web_search["fetchedPages"] = _public_fetched_pages(pages)
    return context


def append_web_search_context(user_input: str, web_search: Dict[str, Any]) -> str:
    context = build_web_search_context(web_search)
    if not context:
        return user_input
    return (
        f"{user_input}\n\n{context}\n\n"
        "回答约束：只能引用上方搜索结果中出现的 URL；"
        "如果未使用这些搜索结果，不要声称“根据搜索结果”。"
    )


async def prepare_web_search_for_chat(
    content: str,
    model_user_input: str,
    payload: Optional[Dict[str, Any]] = None,
    conversation: Optional[Dict[str, Any]] = None,
) -> Tuple[str, Dict[str, Any]]:
    metadata = await decide_web_search_for_chat(content, payload=payload, conversation=conversation)
    if not metadata.get("shouldSearch"):
        return model_user_input, metadata
    try:
        query = _safe_search_query(metadata.get("query") or content, metadata)
        search_payload = await search_web(
            query,
            max_results=_setting_int("WEB_SEARCH_MAX_RESULTS", 10),
        )
        results = list(search_payload.get("results") or [])[:10]
        fetched_pages = await fetch_search_result_pages(results, query) if results else []
        metadata.update({
            "used": bool(results),
            "provider": search_payload.get("provider") or metadata.get("provider"),
            "query": search_payload.get("query") or query,
            "cacheHit": bool(search_payload.get("cacheHit")),
            "results": results,
            "_fetchedPages": fetched_pages,
            "fetchedPages": _public_fetched_pages(fetched_pages),
        })
        if not results:
            metadata["decisionReason"] = metadata.get("decisionReason") or "搜索未返回可用结果"
        enhanced_input = append_web_search_context(model_user_input, metadata)
        metadata.pop("_fetchedPages", None)
        return enhanced_input, metadata
    except Exception as exc:
        existing_error = metadata.get("error")
        metadata.update({
            "used": False,
            "results": [],
            "fetchedPages": [],
            "error": "; ".join(part for part in [existing_error, str(exc)] if part),
        })
        metadata.pop("_fetchedPages", None)
        return model_user_input, metadata
