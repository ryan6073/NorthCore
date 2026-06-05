import zipfile
from pathlib import Path
from typing import Optional


LEGACY_OFFICE_EXTENSIONS = {".ppt", ".doc", ".xls"}
OPENXML_OFFICE_EXTENSIONS = {".pptx", ".docx", ".xlsx"}


def office_extension(path: str) -> str:
    return Path(str(path or "")).suffix.lower()


def is_legacy_office_path(path: str) -> bool:
    return office_extension(path) in LEGACY_OFFICE_EXTENSIONS


def is_openxml_office_path(path: str) -> bool:
    return office_extension(path) in OPENXML_OFFICE_EXTENSIONS


def office_write_block_reason(path: str) -> Optional[str]:
    suffix = office_extension(path)
    if suffix in LEGACY_OFFICE_EXTENSIONS:
        return "不支持生成老式 Office 二进制格式，请改为生成 .pptx/.docx/.xlsx"
    if suffix in OPENXML_OFFICE_EXTENSIONS:
        return "不能用 write_file 写入 Office OpenXML 文件；请在 sandbox 中用命令和 python-pptx/python-docx/openpyxl 生成真实二进制文件"
    return None


def validate_openxml_office_file(path: Path) -> Optional[str]:
    suffix = path.suffix.lower()
    if suffix not in OPENXML_OFFICE_EXTENSIONS:
        return None
    if not path.is_file():
        return "Office 文件不存在"
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names:
                return "不是合法 OpenXML Office 文件：缺少 [Content_Types].xml"
            if suffix == ".pptx" and not any(name.startswith("ppt/slides/slide") and name.endswith(".xml") for name in names):
                return "不是合法 PPTX：缺少幻灯片内容"
            if suffix == ".docx" and "word/document.xml" not in names:
                return "不是合法 DOCX：缺少 word/document.xml"
            if suffix == ".xlsx" and not any(name.startswith("xl/worksheets/sheet") and name.endswith(".xml") for name in names):
                return "不是合法 XLSX：缺少工作表内容"
    except zipfile.BadZipFile:
        return "不是合法 OpenXML Office 文件：文件不是 zip 结构"
    except Exception as exc:
        return f"Office 文件校验失败：{exc}"
    return None
