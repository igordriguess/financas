import { PERSON_LABEL, type Responsible } from '../domain/types';

/** Cores fixas por responsável (identificação, não saldo separado). */
export const RESPONSIBLE_COLOR: Record<Responsible, string> = {
  igor: '#2f6bf0',
  carol: '#db2777',
  casal: '#7c3aed',
};

/* Silhuetas simples: homem (cabelo curto), mulher (cabelo longo) e casal. */
function Man() {
  return (
    <>
      <circle cx="12" cy="8.6" r="3.9" />
      <path d="M7.9 8.1C7.9 5.4 9.7 3.6 12 3.6s4.1 1.8 4.1 4.5c-1.1-1.1-2.5-1.6-4.1-1.6s-3 .5-4.1 1.6z" opacity=".55" />
      <path d="M4.2 21c.3-4.2 3.6-6.8 7.8-6.8s7.5 2.6 7.8 6.8z" />
    </>
  );
}
function Woman() {
  return (
    <>
      <path d="M6.6 14.2c.6-2.2.6-4 .6-5.4 0-3.1 2.1-5.3 4.8-5.3s4.8 2.2 4.8 5.3c0 1.4 0 3.2.6 5.4-1.4.7-2.9.9-2.9.9H9.5s-1.5-.2-2.9-.9z" opacity=".55" />
      <circle cx="12" cy="8.9" r="3.6" />
      <path d="M4.2 21c.3-4 3.6-6.4 7.8-6.4s7.5 2.4 7.8 6.4z" />
    </>
  );
}

export function PersonGlyph({ who, size = 16 }: { who: Responsible; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      {who === 'igor' && <Man />}
      {who === 'carol' && <Woman />}
      {who === 'casal' && (
        <>
          <g transform="translate(-3.4 1.6) scale(.82)">
            <Man />
          </g>
          <g transform="translate(7.7 1.6) scale(.82)">
            <Woman />
          </g>
        </>
      )}
    </svg>
  );
}

/** Avatar redondo do responsável. */
export function PersonAvatar({ who, size = 28, ring, solid }: { who: Responsible; size?: number; ring?: boolean; solid?: boolean }) {
  const c = RESPONSIBLE_COLOR[who];
  return (
    <span
      className={ring ? 'inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white dark:ring-ink-800' : 'inline-flex shrink-0 items-center justify-center rounded-full'}
      style={{ width: size, height: size, background: solid ? c : `${c}1f`, color: solid ? '#fff' : c }}
      data-tip={`Responsável: ${PERSON_LABEL[who]}`}
      aria-label={`Responsável: ${PERSON_LABEL[who]}`}
      role="img"
    >
      <PersonGlyph who={who} size={Math.round(size * 0.72)} />
    </span>
  );
}

/** Ícone + nome, para usar dentro de textos e subtítulos. */
export function PersonTag({ who, className }: { who: Responsible; className?: string }) {
  const c = RESPONSIBLE_COLOR[who];
  return (
    <span className={`inline-flex items-center gap-1 align-middle font-medium ${className ?? ''}`} style={{ color: c }}>
      <PersonGlyph who={who} size={14} />
      {PERSON_LABEL[who]}
    </span>
  );
}

/** Ícone da categoria com o avatar do responsável no canto. */
export function WithOwner({ children, who }: { children: React.ReactNode; who: Responsible }) {
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className="absolute -bottom-1 -right-1">
        <PersonAvatar who={who} size={19} ring solid />
      </span>
    </span>
  );
}
