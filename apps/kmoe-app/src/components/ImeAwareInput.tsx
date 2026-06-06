import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompositionEvent, InputHTMLAttributes } from 'react'

type ImeAwareInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
}

export function ImeAwareInput({
  value,
  onValueChange,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: ImeAwareInputProps) {
  const composingRef = useRef(false)
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    if (!composingRef.current) setDraftValue(value)
  }, [value])

  const commitValue = useCallback((nextValue: string) => {
    setDraftValue(nextValue)
    onValueChange(nextValue)
  }, [onValueChange])

  return (
    <input
      {...props}
      value={draftValue}
      onChange={(event) => {
        const nextValue = event.currentTarget.value
        setDraftValue(nextValue)
        if (!composingRef.current && !isNativeComposing(event.nativeEvent)) {
          onValueChange(nextValue)
        }
      }}
      onCompositionStart={(event) => {
        composingRef.current = true
        setDraftValue(event.currentTarget.value)
        onCompositionStart?.(event)
      }}
      onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
        composingRef.current = false
        commitValue(event.currentTarget.value)
        onCompositionEnd?.(event)
      }}
    />
  )
}

function isNativeComposing(event: Event): boolean {
  return 'isComposing' in event && Boolean((event as InputEvent).isComposing)
}
