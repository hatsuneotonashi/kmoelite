import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoverImage } from '../components/CoverImage'

const nativeFetchCoverImageMock = vi.hoisted(() => vi.fn())

vi.mock('../platform/nativeCommands', () => ({
  nativeFetchCoverImage: nativeFetchCoverImageMock
}))

describe('CoverImage', () => {
  beforeEach(() => {
    nativeFetchCoverImageMock.mockReset()
  })

  it('recovers a failed remote cover through the native in-memory image bridge', async () => {
    nativeFetchCoverImageMock.mockResolvedValueOnce({
      ok: true,
      available: true,
      value: 'data:image/jpeg;base64,AA==',
      message: '封面图片已读取。'
    })

    render(
      <CoverImage
        src="https://kmimg.mxomo.com/cover/a.jpg!cover_l?sign=sample"
        title="王者天下"
        subtitle="原泰久"
      />
    )

    const image = screen.getByAltText('王者天下')
    fireEvent.error(image)

    await waitFor(() => {
      expect(nativeFetchCoverImageMock).toHaveBeenCalledWith('https://kmimg.mxomo.com/cover/a.jpg!cover_l?sign=sample')
      expect(screen.getByAltText('王者天下')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
    })
  })

  it('recovers remote placeholder covers that load as empty images', async () => {
    nativeFetchCoverImageMock.mockResolvedValueOnce({
      ok: true,
      available: true,
      value: 'data:image/jpeg;base64,BB==',
      message: '封面图片已读取。'
    })

    render(
      <CoverImage
        src="https://kmimg.mxomo.com/cover/empty.jpg!cover_l?sign=sample"
        title="圣洁少女的秘密情事"
      />
    )

    const image = screen.getByAltText('圣洁少女的秘密情事')
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1 })
    fireEvent.load(image)

    await waitFor(() => {
      expect(nativeFetchCoverImageMock).toHaveBeenCalledWith('https://kmimg.mxomo.com/cover/empty.jpg!cover_l?sign=sample')
      expect(screen.getByAltText('圣洁少女的秘密情事')).toHaveAttribute('src', 'data:image/jpeg;base64,BB==')
    })
  })

  it('does not call the native bridge for local fixture covers', () => {
    render(<CoverImage src="/covers/sample.jpg" title="本地封面" />)

    fireEvent.error(screen.getByAltText('本地封面'))

    expect(nativeFetchCoverImageMock).not.toHaveBeenCalled()
  })
})
