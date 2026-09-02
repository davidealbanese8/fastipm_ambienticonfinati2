import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'success' | 'rimodula' | 'danger' | 'rdlc' | 'neutral';

export function Button({
  variant = 'neutral',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${styles.btn} ${styles[variant]} ${className ?? ''}`} {...rest} />;
}
