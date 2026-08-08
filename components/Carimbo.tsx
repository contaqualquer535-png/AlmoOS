import { CODIGO_STATUS, ROTULO_STATUS, type StatusVerificacao } from '@/lib/types/database';

/** O quadrado ✓ / M / X / T, mesma convenção da planilha impressa. */
export function Carimbo({ status }: { status: StatusVerificacao }) {
  return (
    <span className={`carimbo carimbo--${status}`} title={ROTULO_STATUS[status]}>
      <span aria-hidden="true">{CODIGO_STATUS[status]}</span>
      <span className="visualmente-oculto">{ROTULO_STATUS[status]}</span>
    </span>
  );
}
