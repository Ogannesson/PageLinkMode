export function submitFormInCurrentTab(form: HTMLFormElement): void {
  const previousTarget = form.target;
  form.target = "_self";
  HTMLFormElement.prototype.submit.call(form);
  form.target = previousTarget;
}

export function submitFormInNewTab(form: HTMLFormElement): void {
  const previousTarget = form.target;
  const targetName = `pagelinkmode_${Date.now()}`;
  window.open("about:blank", targetName, "noopener");
  form.target = targetName;
  HTMLFormElement.prototype.submit.call(form);
  form.target = previousTarget;
}
