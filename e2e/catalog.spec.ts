import { expect, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('search finds songs by title and by singer, and the singers tab lists artists', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const singer = `Cantora Brisa ${tag}`;
  const other = `Cantor Rio ${tag}`;
  const first = await seedSong(`Aurora do Campo ${tag}`, singer, [{ key: 'C' }, { key: 'D' }]);
  const second = await seedSong(`Vale Sereno ${tag}`, singer, [{ key: 'G' }]);
  const third = await seedSong(`Rio Manso ${tag}`, other, [{ key: 'A' }]);
  await signInAs(page, ADMIN, 'Admin');

  const search = page.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' });
  const songLink = (title: string) => page.locator('a.list-main', { hasText: title });

  // By title.
  await search.fill(`Aurora do Campo ${tag}`);
  await expect(songLink(first.title)).toBeVisible();
  await expect(songLink(second.title)).toHaveCount(0);
  await expect(songLink(third.title)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: `${first.title}, tom D`, exact: true }),
  ).toBeVisible();
  await shot(page, testInfo, 'catalog-1-search-title');

  // By singer, in the songs tab: both of that singer's songs, none of the other's.
  await search.fill(singer);
  await expect(songLink(first.title)).toBeVisible();
  await expect(songLink(second.title)).toBeVisible();
  await expect(songLink(third.title)).toHaveCount(0);

  // Nothing found.
  await search.fill(`zzz sem resultado ${tag}`);
  await expect(page.getByText('Nada encontrado para')).toBeVisible();

  // Singers tab.
  await search.fill('');
  await page.getByRole('link', { name: 'Cantores', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Cantores', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const artists = page.getByRole('searchbox', { name: 'Buscar cantor…' });
  await artists.fill(singer);
  const row = page.getByRole('link', { name: new RegExp(`${singer}.*2 músicas`) });
  await expect(row).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(other) })).toHaveCount(0);
  await shot(page, testInfo, 'catalog-2-singers-tab');

  await row.click();
  await expect(page.getByRole('heading', { name: new RegExp(singer) })).toBeVisible();
  await expect(songLink(first.title)).toBeVisible();
  await expect(songLink(second.title)).toBeVisible();
  await shot(page, testInfo, 'catalog-3-singer-page');

  await songLink(second.title).click();
  await expect(page).toHaveURL(new RegExp(`/musicas/${second.id}`));
});
