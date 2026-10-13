export function composerMaterial(dock) {
  const card = dock?.closest('[data-composer-seat]')?.querySelector('[data-composer-card]')
  if (!card) return {}
  const style = card.ownerDocument.defaultView.getComputedStyle(card)
  return {
    '--hlpin-material-bg': style.backgroundColor,
    '--hlpin-material-image': style.backgroundImage || 'none',
    '--hlpin-material-shadow': style.boxShadow || 'none',
    '--hlpin-material-border': `${style.borderTopWidth || '0px'} ${style.borderTopStyle || 'none'} ${style.borderTopColor || 'transparent'}`,
    '--hlpin-material-radius': style.borderRadius || 'var(--dsw-radius-panel)',
    '--hlpin-material-blur': style.backdropFilter || style.webkitBackdropFilter || 'none',
  }
}
