import { Assistente } from '@/components/Assistente';

export const dynamic = 'force-dynamic';

export default function PaginaAssistente() {
  return (
    <>
      <p className="sobrescrito">Consulta e ação sobre os dados do CETEC</p>
      <h1 className="titulo">Assistente</h1>

      <p className="nota-de-origem" style={{ marginTop: '1rem' }}>
        As respostas vêm de um modelo de linguagem lendo o banco pelas ferramentas.
        Consulta ele faz sozinho; gravar tarefa, chamado ou suprimento só depois da
        sua confirmação. Números importantes vale conferir na tela correspondente.
      </p>

      <Assistente />
    </>
  );
}
