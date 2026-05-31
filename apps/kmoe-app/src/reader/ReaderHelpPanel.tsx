import { Keyboard, Monitor, MousePointer2, Smartphone, X } from 'lucide-react'

export type ReaderHelpMode = 'phone' | 'tablet' | 'desktop'

type ReaderHelpSectionKind = 'touch' | 'keyboard' | 'pointer' | 'recovery'
type ReaderHelpSection = {
  kind: ReaderHelpSectionKind
  title: string
  description: string
  items: Array<{ label: string; value: string }>
}

export function ReaderHelpPanel({
  id,
  mode,
  onClose,
  onScrimClick
}: {
  id: string
  mode: ReaderHelpMode
  onClose: () => void
  onScrimClick: () => void
}) {
  const modeLabel = mode === 'phone' ? 'iPhone 触控' : mode === 'tablet' ? 'iPad 多栏阅读' : '桌面阅读'
  const sections = getReaderHelpSections(mode)
  return (
    <div className="reader-panel-layer" data-reader-interactive="true">
      <button className="reader-panel-scrim" type="button" aria-label="关闭帮助" onClick={onScrimClick} />
      <aside id={id} className="reader-side-panel reader-help-panel" aria-label="阅读器帮助和快捷键">
        <div className="reader-panel-header">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Guide</p>
            <h2 className="mt-1 truncate text-base font-semibold text-white">{modeLabel}</h2>
            <p className="mt-1 text-xs text-white/58">
              当前面板打开时翻页快捷键会暂停，按 Esc 先关闭面板。
            </p>
          </div>
          <button className="reader-panel-close" type="button" aria-label="关闭帮助" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="reader-help-scroll">
          {sections.map((section) => (
            <section key={section.title} className="reader-help-section">
              <div className="reader-help-section-heading">
                {renderReaderHelpIcon(section.kind)}
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
              </div>
              <div className="reader-help-list">
                {section.items.map((item) => (
                  <div key={`${section.title}:${item.label}`} className="reader-help-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}

export function getReaderHelpMode(width?: number): ReaderHelpMode {
  if (typeof width === 'number' && width < 768) return 'phone'
  if (typeof width === 'number' && width < 1180) return 'tablet'
  return 'desktop'
}

function getReaderHelpSections(mode: ReaderHelpMode): ReaderHelpSection[] {
  const touch: ReaderHelpSection = {
    kind: 'touch',
    title: '触控手势',
    description: mode === 'phone' ? '适合单手和拇指操作。' : '适合 iPad 触控、触控板和 Apple Pencil 点击。',
    items: [
      { label: '左右滑动', value: '按阅读方向翻页' },
      { label: '左/右热区', value: '上一页 / 下一页' },
      { label: '中间点击', value: '显示或隐藏控制层' },
      { label: '双指缩放', value: '放大后拖拽查看细节' },
      { label: '双击图片', value: '快速放大 / 还原' }
    ]
  }
  const keyboard: ReaderHelpSection = {
    kind: 'keyboard',
    title: mode === 'tablet' ? '键盘快捷键' : '桌面快捷键',
    description: mode === 'tablet' ? '外接键盘时使用，打开目录或帮助面板时会暂停翻页。' : '适合 macOS / Windows 阅读和大屏窗口。',
    items: [
      { label: 'Space / PageDown', value: '下一页' },
      { label: 'PageUp', value: '上一页' },
      { label: 'Home / End', value: '首页 / 末页' },
      { label: '← / →', value: '按阅读方向翻页' },
      { label: '[ / ]', value: '上一章 / 下一章' },
      { label: '?', value: '打开本帮助' },
      { label: 'Esc', value: '关闭面板，再次按返回' }
    ]
  }
  const pointer: ReaderHelpSection = {
    kind: 'pointer',
    title: '鼠标与触控板',
    description: '桌面端保持更高信息密度，同时保留漫画阅读的沉浸热区。',
    items: [
      { label: '滚轮 / 横向滚动', value: '分页模式下翻页' },
      { label: '悬停按钮', value: '显示可点击操作反馈' },
      { label: '拖拽放大页', value: '缩放超过 1x 后优先平移图片' },
      { label: '目录按钮', value: '打开缩略图并跳页' }
    ]
  }
  const recovery: ReaderHelpSection = {
    kind: 'recovery',
    title: '恢复与缓存',
    description: '阅读器只读取已准备的本地缓存，修复和重新下载都保持单项安全队列。',
    items: [
      { label: '单页失败', value: '可重试、跳过或修复缓存' },
      { label: '阅读文件存在', value: '可重新解包阅读缓存' },
      { label: '阅读文件缺失', value: '只加入一个本地 EPUB/source_zip 任务' },
      { label: '缓存清理', value: '不会删除永久下载和阅读记录' }
    ]
  }

  if (mode === 'phone') return [touch, recovery]
  if (mode === 'tablet') return [touch, keyboard, recovery]
  return [keyboard, pointer, recovery]
}

function renderReaderHelpIcon(kind: ReaderHelpSectionKind) {
  if (kind === 'touch') return <Smartphone className="h-5 w-5" />
  if (kind === 'keyboard') return <Keyboard className="h-5 w-5" />
  if (kind === 'pointer') return <MousePointer2 className="h-5 w-5" />
  return <Monitor className="h-5 w-5" />
}
