import clsx from 'clsx';

export default function Button({ children, onClick, variant = 'default', className = '', ...props }) {
  const baseStyles = 'inline-flex items-center justify-center rounded-4xl px-10 py-5 text-2xl font-medium transition-colors';
  const variants = {
    default: 'bg-violet text-white',
    destructive: 'bg-bright-pink text-white',
  };

  return (
    <button
      onClick={onClick}
      className={clsx(baseStyles, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}
