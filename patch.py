import sys

file_path = "/home/linzw/projects/NorthCore/frontend/src/components/chat/AttachmentCard.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the first part (canPreview definition and adding helper function)
target_1 = """  // Determine if file supports online preview
  const canPreview = category === 'pdf' || category === 'video' || category === 'audio' || category === 'ppt' || category === 'excel' || category === 'document';

  if (category === 'image') {"""

replacement_1 = """  // Determine if file supports online preview
  const canPreview = category === 'pdf' || category === 'video' || category === 'audio' || category === 'ppt' || category === 'excel' || category === 'document';

  // Helper to render the modal itself
  function renderPreviewModal() {
    if (!showPreviewModal) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 md:p-10 select-none animate-fade-in" onClick={() => setShowPreviewModal(false)}>
        <div
          className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-slate-250/60 dark:border-slate-800/85 overflow-hidden animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{attachment.name}</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-0.5 font-medium">
                {category === 'pdf' ? 'PDF 文件在线预览' :
                 category === 'video' ? '视频文件在线预览' :
                 category === 'audio' ? '音频文件在线播放' :
                 isTextFile() ? '文本文件在线预览' :
                 category === 'ppt' ? 'PPT 在线幻灯片预览' :
                 category === 'excel' ? 'Excel 在线表格预览' : '文档在线预览'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={attachment.url}
                download={attachment.name}
                className="px-3.5 py-1.5 bg-violet-650 hover:bg-violet-600 text-white rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-md shadow-violet-600/10 active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载文件</span>
              </a>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-550 hover:text-slate-650 dark:hover:text-slate-200 transition-all border border-transparent hover:border-slate-200/40 dark:hover:border-slate-800 shadow-none active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div className="flex-grow bg-slate-100 dark:bg-slate-950 relative min-h-0">
            {isLoadingPreview ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 select-none">
                <Loader2 className="w-8 h-8 text-violet-600 animate-spin mb-3" />
                <p className="text-xs text-slate-555 dark:text-slate-400 font-medium">正在缓冲加载文件，请稍候...</p>
              </div>
            ) : previewError ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto select-none">
                <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/45 flex items-center justify-center mb-4 text-red-500">
                  <File className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-100 mb-1">无法在线预览</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4 font-medium">
                  {previewError}
                </p>
                <a
                  href={attachment.url}
                  download={attachment.name}
                  className="px-4 py-2 bg-violet-650 hover:bg-violet-600 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all"
                >
                  下载文件本地查看
                </a>
              </div>
            ) : textContent !== null ? (
              <div className="w-full h-full p-4 overflow-auto bg-slate-50 dark:bg-slate-900 select-text">
                <pre className="text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-medium break-all">
                  {textContent}
                </pre>
              </div>
            ) : previewBlobUrl ? (
              category === 'video' ? (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <video src={previewBlobUrl} controls className="max-w-full max-h-full" autoPlay />
                </div>
              ) : category === 'audio' ? (
                <div className="w-full h-full flex items-center justify-center p-10 bg-slate-50 dark:bg-slate-900/60">
                  <div className="flex flex-col items-center gap-4 bg-white dark:bg-slate-950 p-8 rounded-2xl shadow-lg border border-slate-200/50 dark:border-slate-800/80 max-w-sm w-full">
                    <Music className="w-10 h-10 text-purple-500 animate-bounce-subtle" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-xs">{attachment.name}</span>
                    <audio src={previewBlobUrl} controls className="w-full mt-2" autoPlay />
                  </div>
                </div>
              ) : (
                <iframe
                  src={previewBlobUrl}
                  className="w-full h-full border-0"
                  title="Document Preview"
                />
              )
            ) : (
              // Office Online local fallback warning screen
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto select-none">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/45 flex items-center justify-center mb-4 text-orange-500">
                  <Presentation className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  本地暂存文件不支持在线预览
                </h3>
                <p className="text-xs text-slate-555 dark:text-slate-400 leading-relaxed mb-4 font-medium">
                  该文件为本地上传的临时缓存文件，或者在本地开发环境中（localhost），在线 Office 服务无法直接访问您的本地客户端地址。建议您直接下载后在本地查看。
                </p>
                <a
                  href={attachment.url}
                  download={attachment.name}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-orange-500/10 active:scale-95 transition-all"
                >
                  下载文件
                </a>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (category === 'image') {"""

# Replace the second part (broken a tag, nested helper definition, and duplicate code at the end)
# We can find where the broken part starts:
idx = content.find('className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold')
if idx == -1:
    print("Could not find the target code section!")
    sys.exit(1)

# We want to replace everything from that point onwards to the end of the file
# with a clean return block and end of the component
part_before = content[:idx]

part_after_clean = """className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 border border-violet-200/80 dark:border-violet-800/30 text-violet-700 dark:text-violet-300 transition-all duration-200 active:scale-95 shadow-sm"
          title="下载附件"
        >
          <Download className="w-3.5 h-3.5" />
          <span>下载</span>
        </a>
      </div>
      {renderPreviewModal()}
    </div>
  );
};

export default AttachmentCard;
"""

new_content = part_before + part_after_clean
new_content = new_content.replace(target_1, replacement_1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Patch applied successfully!")
