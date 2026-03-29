import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { colors } from '../../theme/colors'

export interface ContextMenuItem {
  label: string
  action: () => void
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    // Use capture to fire before bubbling prevents it
    document.addEventListener('mousedown', handleClick, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust position if menu would overflow viewport
  const menuWidth = 200
  const estimatedMenuHeight = items.length * 30 + 8
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const adjustedY = y + estimatedMenuHeight > window.innerHeight ? y - estimatedMenuHeight : y

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: adjustedY,
        left: adjustedX,
        zIndex: 9999,
        backgroundColor: colors.bg.tertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: '4px',
        minWidth: `${menuWidth}px`,
        userSelect: 'none',
      }}
      // Stop propagation so the document click handler doesn't immediately close
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return (
            <div
              key={idx}
              style={{
                height: '1px',
                backgroundColor: colors.border,
                margin: '4px 0',
              }}
            />
          )
        }
        return (
          <ContextMenuRow
            key={idx}
            item={item}
            onClose={onClose}
          />
        )
      })}
    </div>,
    document.body
  )
}

function ContextMenuRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!item.disabled) {
          item.action()
          onClose()
        }
      }}
      style={{
        padding: '5px 10px',
        fontSize: '13px',
        borderRadius: '5px',
        cursor: item.disabled ? 'not-allowed' : 'pointer',
        color: item.disabled
          ? colors.text.muted
          : item.danger
          ? colors.status.D
          : colors.text.primary,
        backgroundColor: hovered && !item.disabled ? colors.bg.hover : 'transparent',
        transition: 'background-color 0.1s',
        opacity: item.disabled ? 0.5 : 1,
      }}
    >
      {item.label}
    </div>
  )
}
