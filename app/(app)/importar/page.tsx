import { Importador } from '@/components/Importador';

export const dynamic = 'force-dynamic';

export default function PaginaImportar() {
  return (
    <>
      <p className="sobrescrito">Carga de planilha</p>
      <h1 className="titulo">Importar</h1>
      <p className="vazio">
        Traz para dentro o que hoje está em papel ou em outro sistema. Nada é gravado
        antes de você ver a prévia e os problemas encontrados.
      </p>

      <Importador />
    </>
  );
}
