import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LibraryPage } from '../pages/LibraryPage'
import { useDownloadStore } from '../store/downloadStore'

describe('Library metadata-only imports', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useDownloadStore.setState({
      tasks: [],
      library: []
    })
  })

  it('marks imported snapshot records as metadata-only and disables file actions', async () => {
    useDownloadStore.getState().replaceLibrary([
      {
        id: 'imported-file',
        taskId: 'imported-task',
        comicId: '53339',
        comicTitle: '尖帽子的魔法工房',
        volId: '3089',
        volumeTitle: '話 089-095',
        format: 'mobi',
        localPath: 'Imported metadata only/尖帽子的魔法工房 - 話 089-095.mobi',
        sizeBytes: 200,
        downloadedAt: '2026-05-21T04:40:00Z'
      }
    ])

    renderLibraryPage()

    expect(await screen.findByText('需绑定文件')).toBeInTheDocument()
    expect(screen.getByText('期望文件扩展名：.mobi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '查看位置' })).toBeDisabled()

    expect(screen.getByLabelText('文件路径')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '绑定文件' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('文件路径'), { target: { value: '/tmp/local.mobi' } })
    fireEvent.click(screen.getByRole('button', { name: '绑定文件' }))
    expect(await screen.findByText('暂时无法绑定文件，请确认选择的是对应格式的文件。')).toBeInTheDocument()
  })

  it('does not expose a destructive library-clearing action', async () => {
    useDownloadStore.getState().replaceLibrary([
      {
        id: 'local-file',
        taskId: 'local-task',
        comicId: '10180',
        comicTitle: 'GRAND BLUE 碧藍之海',
        volId: '1001',
        volumeTitle: '卷 01',
        format: 'mobi',
        localPath: '~/Downloads/Kmoe/GRAND BLUE 碧藍之海 - 卷 01.mobi',
        sizeBytes: 200,
        downloadedAt: '2026-05-21T04:40:00Z'
      }
    ])

    renderLibraryPage()

    expect(await screen.findByText('GRAND BLUE 碧藍之海')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /清空资料库/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认清空资料库/ })).not.toBeInTheDocument()
    expect(useDownloadStore.getState().library).toHaveLength(1)
  })
})

function renderLibraryPage() {
  return render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>
  )
}
