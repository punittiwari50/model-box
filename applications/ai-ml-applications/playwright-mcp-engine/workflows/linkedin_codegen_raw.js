const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/');
  await page.getByRole('link', { name: 'Sign in with email' }).click();
  await page.getByRole('textbox', { name: 'Email or phone' }).click();
  await page.getByRole('textbox', { name: 'Email or phone' }).fill(process.env.LINKEDIN_USERNAME || 'user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.LINKEDIN_PASSWORD || 'YOUR_PASSWORD_HERE');
  await page.getByRole('button', { name: 'Show password' }).click();
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.goto('https://www.linkedin.com/feed/');
  await page.getByRole('link', { name: 'Jobs, 0 new notifications' }).click();
  await page.getByRole('link', { name: 'Lead Software Engineer (' }).click();
  await page.locator('#workspace').click();
  await page.getByRole('button', { name: 'More about Company focus areas' }).click();
  await page.getByRole('paragraph').filter({ hasText: 'Focus on Information' }).getByTestId('expandable-text-button').click();
  await page.locator('#JobDetails_AboutTheJob_4438692931').getByTestId('expandable-text-button').click();
  await page.getByTestId('typeahead-input').click();
  await page.getByTestId('typeahead-input').fill('Solution Architect');
  await page.getByTestId('typeahead-input').press('Enter');
  await page.getByRole('button', { name: 'Filter by Date posted' }).click();
  await page.getByRole('checkbox', { name: 'Date posted' }).check();
  await page.getByRole('paragraph').filter({ hasText: 'Past 24 hours' }).click();
  await page.getByRole('link', { name: 'Show results' }).click();
  await page.getByRole('button', { name: 'Consulting Solutions Engineer (Verified job) NetApp Mumbai Metropolitan Region' }).click();
  await page.getByRole('button', { name: 'Solutions Architect Sr. Manager - Power (Verified job) Vertiv Thane Dismiss' }).click();
  await page.getByRole('button', { name: 'SAP Data-AD (Verified job) EY' }).click();
  await page.getByRole('button', { name: 'Sr. Technical Engineer – SAP Platform, Dev (Verified job) General Mills Mumbai' }).click();
  await page.getByRole('button', { name: 'Azure Security Architect (' }).click();

  // ---------------------
  await context.close();
  await browser.close();
})();