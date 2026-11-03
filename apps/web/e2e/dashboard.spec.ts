import { expect, test } from '@playwright/test'

test('demo dashboard stays labelled and the main routes render', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Demo chain (synthetic)').first()).toBeVisible()
  await expect(page.getByText('Demo data').first()).toBeVisible()
  await expect(page.getByText('Gas right now')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Execution base fee chart' })).toBeVisible()
  await page.getByRole('button', { name: '1h' }).click()
  await expect(page).toHaveURL(/preset=1h/)
  await page.getByRole('button', { name: '15m' }).click()
  await expect(page).toHaveURL(/preset=15m/)

  await page.getByRole('link', { name: 'Why Gas Changed' }).click()
  await expect(page.getByRole('heading', { name: 'Why gas changed' })).toBeVisible()
  await expect(page.getByText(/PROTOCOL-EXACT|OBSERVED ON-CHAIN|INFERRED|MODELLED/).first()).toBeVisible()

  await page.getByRole('link', { name: 'Top Drivers' }).click()
  await expect(page.getByRole('heading', { name: 'Top drivers' })).toBeVisible()
  await page.getByRole('button', { name: 'Called contracts' }).click()
  await expect(page).toHaveURL(/groupBy=contract/)

  await page.getByRole('link', { name: 'Block Explorer' }).click()
  await expect(page.getByRole('heading', { name: 'Block explorer' })).toBeVisible()

  await page.getByRole('link', { name: 'Sources & Methodology' }).click()
  await expect(page.getByRole('heading', { name: 'Sources and methodology' })).toBeVisible()

  await page.goto('/fixture')
  await expect(page.getByText('26330059')).toBeVisible()
  await expect(page.getByText('Unidentified method 0x6ceef480')).toBeVisible()
  await expect(page.getByText(/does not invent/i)).toBeVisible()
  await expect(page.getByText('Ethereum Mainnet')).toHaveCount(0)
})
