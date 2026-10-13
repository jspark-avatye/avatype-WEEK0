import type { ComponentPropsWithoutRef } from 'react';
import './button.css';

export function Button({
  className,
  type = 'button',
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return <button {...props} type={type} className={['button', className].filter(Boolean).join(' ')} />;
}
