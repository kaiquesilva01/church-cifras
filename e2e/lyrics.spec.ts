import { expect, chip, shot, signInAs, ADMIN, test } from './fixtures/app';
import { syntheticPdf } from './fixtures/pdf';
import { lettersTag } from './fixtures/names';

test('busca por letra finds a freshly uploaded song by a line of its lyrics', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const title = `Musica Letra ${tag}`;
  const artist = `Cantor Letra ${tag}`;
  await signInAs(page, ADMIN, 'Admin');

  // The admin uploads a new song: its lyrics are extracted from the PDF and saved with it.
  await page.getByRole('link', { name: /Nova cifra/ }).click();
  await expect(page.getByRole('heading', { name: 'Nova cifra' })).toBeVisible();
  await page.getByLabel('Escolher PDF').setInputFiles({
    name: `${title} - ${artist} (C).pdf`,
    mimeType: 'application/pdf',
    buffer: await syntheticPdf({ title, artist, key: 'C' }),
  });
  await expect(page.getByRole('status').filter({ hasText: '15 acordes' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar cifra' }).click();
  await expect(page).toHaveURL(/\/musicas\/[^/?]+\?tom=C$/);
  await expect(chip(page, title, 'C')).toHaveAttribute('aria-current', 'true');

  // The song's card in the "Na letra" section, scoped by its unique title.
  const card = (name: string) => page.locator('li.song-card').filter({ hasText: name });
  const phrase = 'campo verde';

  // Busca: the lyric match appears with the song's card and the highlighted words.
  await page.goto('/busca');
  const buscaSearch = page.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' });
  await buscaSearch.fill(phrase);
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toBeVisible();
  await expect(card(title)).toBeVisible();
  await expect(card(title).locator('mark.lyric-hit', { hasText: phrase })).toBeVisible();
  await shot(page, testInfo, 'lyrics-1-busca');

  // The Cantores filter does not search lyrics: the section goes away.
  await page
    .getByRole('group', { name: 'Filtrar resultados' })
    .getByRole('button', { name: 'Cantores', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toHaveCount(0);
  await expect(card(title)).toHaveCount(0);

  // Under 3 characters the lyrics are not searched. "lu" really occurs in the lyrics ("Luz que
  // nasce…") and not in this song's title or artist, so only the 3-character rule keeps it out.
  await page
    .getByRole('group', { name: 'Filtrar resultados' })
    .getByRole('button', { name: 'Tudo', exact: true })
    .click();
  // Tudo is back: the lyric match for the phrase is on screen again, so the next step starts from a
  // visible card and the absence below can only come from the new query being applied.
  await expect(card(title)).toBeVisible();
  await buscaSearch.fill('lu');
  await expect(page).toHaveURL(/[?&]q=lu(&|$)/);
  await expect(card(title)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toHaveCount(0);

  // At 3 characters the same word is searched: the song comes back under "Na letra".
  await buscaSearch.fill('luz');
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toBeVisible();
  await expect(card(title)).toBeVisible();
  await expect(card(title).locator('mark.lyric-hit', { hasText: /luz/i })).toBeVisible();

  // Home, Músicas tab: the same search shows the section and the card.
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Músicas' })
    .click();
  const homeSearch = page.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' });
  await homeSearch.fill(phrase);
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toBeVisible();
  await expect(card(title)).toBeVisible();
  await expect(card(title).locator('mark.lyric-hit', { hasText: phrase })).toBeVisible();
  await shot(page, testInfo, 'lyrics-2-home-musicas');

  // Home, Cantores tab: lyrics are not searched there.
  await page
    .getByRole('navigation', { name: 'Seções' })
    .getByRole('link', { name: 'Cantores', exact: true })
    .click();
  const cantoresSearch = page.getByRole('searchbox', { name: 'Buscar cantor…' });
  await cantoresSearch.fill(phrase);
  await expect(cantoresSearch).toHaveValue(phrase);
  await expect(page.getByRole('heading', { name: 'Na letra', exact: true })).toHaveCount(0);
  await expect(card(title)).toHaveCount(0);
});
