/** A project has a page when the home page or the work page lists it. */
export function projectHasPage(project, homeIds = []) {
  if (!project) return false;
  if (project.showInWork) return true;
  const id = String(project._id ?? '').replace(/^drafts\./, '');
  if (!id) return false;
  return homeIds.some((homeId) => String(homeId).replace(/^drafts\./, '') === id);
}
