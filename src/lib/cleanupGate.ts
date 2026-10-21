/**
 * Regra que decide se o botão "Confirmar" do modal de limpeza pode ser clicado.
 *
 * Toda limpeza mostra primeiro uma pré-visualização (dry run: lista do que vai sair
 * + total) antes de liberar a confirmação. Projeto com git sujo ou commits não
 * enviados exige digitar o nome exato do projeto, além da pré-visualização pronta.
 */
export interface CleanupGateState {
  previewReady: boolean;
  requiresNameConfirmation: boolean;
  typedName: string;
  projectName: string;
}

export function canConfirmCleanup(state: CleanupGateState): boolean {
  if (!state.previewReady) {
    return false;
  }
  if (!state.requiresNameConfirmation) {
    return true;
  }
  return state.typedName.trim() === state.projectName;
}
