import {
  expect,
  expectRole,
  promoteToMember,
  registerVisitor,
  shot,
  signInToAccessScreen,
  signInWithPopup,
  test,
} from './fixtures/app';
import { seedSetlist, seedSong, todayInSaoPaulo } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

const ACCESS_HEADING = 'Acesso ainda não liberado';
const PRINCIPAL = /^Principal$/;

// Any App route a visitor could type or follow (#126 criterion 1): none may open for them.
const appRoutes = (songId: string) => [
  '/',
  '/busca',
  '/pad',
  '/mais',
  `/musicas/${songId}`,
  '/repertorios/inexistente',
  '/nova',
  '/pessoas',
  '/estatisticas',
  '/importar',
];

test('visitor sees only the access screen until an admin releases the account', async ({
  page,
  browser,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Sol da Manha ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  const person = await registerVisitor(`visitante-${tag.toLowerCase()}`);

  // Criterion 8: no Firestore or Storage call may fail with a permission error before the
  // access screen. Collected from the first navigation of this page on.
  const permissionProblems: string[] = [];
  page.on('console', (message) => {
    if (/permission|permiss[aã]o|insufficient/i.test(message.text())) {
      permissionProblems.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (/localhost:(8080|9199)/.test(url) && response.status() === 403) {
      permissionProblems.push(`HTTP ${response.status()}: ${url}`);
    }
  });

  // Criteria 1 and 8: the access screen, with the account e-mail and Sair; no navigation.
  await signInToAccessScreen(page, person);
  await expect(page.locator('.access-card-email')).toHaveText(person.email);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: PRINCIPAL })).toHaveCount(0);
  await shot(page, testInfo, 'visitor-1-access');

  // Criterion 1: every route, typed or from a direct link, falls on the same screen.
  for (const path of appRoutes(song.id)) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: ACCESS_HEADING })).toBeVisible();
    await expect(page.getByRole('navigation', { name: PRINCIPAL })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  }
  await shot(page, testInfo, 'visitor-2-direct-link');
  expect(permissionProblems, permissionProblems.join('\n')).toEqual([]);

  // Sair works from the access screen and returns to the login screen.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: ACCESS_HEADING })).toHaveCount(0);

  // Criterion 6: an admin releases the account in Pessoas; the person enters again and sees the app.
  await promoteToMember(browser, testInfo, person);
  await signInWithPopup(page, person);
  await expectRole(page, 'Membro');
  await expect(page.getByRole('heading', { name: ACCESS_HEADING })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Nova cifra/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }).fill(song.title);
  await expect(page.locator('a.list-main', { hasText: song.title })).toBeVisible();
  await shot(page, testInfo, 'visitor-3-released-member');
});

test('visitor on a setlist link lands on the access screen, not the setlist', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Aurora ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: song.id, key: 'C' },
  ]);
  const person = await registerVisitor(`visitante-rep-${tag.toLowerCase()}`);

  await signInToAccessScreen(page, person);
  await page.goto(`/repertorios/${id}`);
  await expect(page.getByRole('heading', { name: ACCESS_HEADING })).toBeVisible();
  await expect(page.getByText(song.title)).toHaveCount(0);
  await shot(page, testInfo, 'visitor-4-setlist-link');
});
