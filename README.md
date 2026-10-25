# Cyber Logbook

A free, offline-first learning journal for teaching yourself cyber security. Use it for TryHackMe, OverTheWire Bandit, picoGym, Hack The Box, CyberDefenders, Blue Team Labs and your own homelab.

- **Log a session:** time, platform, room, tags, what you did, what you learned, commands, open questions and confidence. The **Explain it to a mate** box is the star of the form. Drafts save as you type, and there's a quick-log mode.
- **Journal:** search and filters. **Cheat sheet:** every command you've logged, with one-tap copy. **Questions:** everything you're still confused about. **Review:** flashcards, lowest confidence first. **Stats:** weekly goal, streaks and a 12-week heatmap.
- **Screenshots on every entry:** paste with Ctrl+V, drag and drop, or use your phone's gallery or camera. Before saving, **black out** passwords, flags, tokens and IP addresses. Images are shrunk to at most 1920 px wide and saved as WebP. Add captions, reorder, view full screen with zoom, and delete.
- **Your data stays with you.** It's stored on each device in IndexedDB and works with no internet. Sync between your PC and phone is free: entry text goes through a secret GitHub Gist, and screenshots through a private GitHub repository on your own account.
- **Export:** Markdown for Obsidian (zip, with screenshots in `attachments/`) and full backups (zip with your screenshots). Import merges by entry and never wipes newer work.

Everything is free: plain HTML/CSS/JavaScript, no build step, no server, hosted on GitHub Pages. The only library is [JSZip](https://stuk.github.io/jszip/) (MIT), included in `vendor/`.

---

## 1. Run it on your PC (optional)

Double-click **`run-local.cmd`**. It starts a tiny web server built into Windows and opens <http://localhost:8080/>. Close the black window to stop it.

> Opening `index.html` directly (as a `file://` page) won't work, because browsers only allow offline mode and modules on a real web address.

## 2. Put it online with GitHub Pages (free, about 10 minutes)

You only need a web browser. These steps use GitHub's website, so you don't need to install anything.

**a) Make a GitHub account**
1. Go to <https://github.com/signup> and sign up with your email. Pick a username. It becomes part of your app's address, e.g. `yourname.github.io`.
2. Verify your email when GitHub asks.

**b) Create the repository (the project's home)**
1. Click **+** (top right) → **New repository**.
2. Repository name: `cyber-logbook`
3. Choose **Public**. GitHub Pages is free for public repos. Only the app's code goes here, **never your journal**.
4. Leave "Add a README" **unticked**. Click **Create repository**.

**c) Upload the files**
1. On the new, empty repository page, click the link **uploading an existing file**.
2. In File Explorer, open this `Cyber-logbook` folder, press **Ctrl+A** to select everything, and drag it all onto the GitHub page. Folders keep their structure.
   - Don't upload any backup or export files (`cyber-logbook-backup-….json`, `.zip`) if you saved them in this folder. They contain your notes.
3. Wait until every file shows in the list, then click **Commit changes** at the bottom.

**d) Turn on GitHub Pages**
1. In the repository, click **Settings** (top) → **Pages** (left menu).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)** → **Save**.
4. Wait 1–2 minutes and refresh the page. It shows **"Your site is live at https://YOUR-USERNAME.github.io/cyber-logbook/"**. That's your app's address. Bookmark it.

**Updating the app later**
Change the files, then open `sw.js` and bump `const VERSION = '…'` (for example from `'1.1.0'` to `'1.1.1'`). Upload the changed files the same way (**Add file → Upload files**) and commit. Installed copies show **"New version available → Tap to update"** the next time they open. See [section 7](#7-putting-an-update-online) for the full steps.

<details>
<summary>Prefer the command line? (optional, needs <a href="https://git-scm.com/download/win">Git for Windows</a>)</summary>

```bash
git init
```
```bash
git add .
```
```bash
git commit -m "Cyber Logbook"
```
```bash
git branch -M main
```
```bash
git remote add origin https://github.com/YOUR-USERNAME/cyber-logbook.git
```
```bash
git push -u origin main
```
Then do step **d** above.
</details>

## 3. Install it as an app

The app has a built-in **Install app** screen that detects your browser and shows these steps.

### Windows PC: use Microsoft Edge (already on Windows 11)

Opera GX can't install web apps on a PC. Cyber Logbook still works fine in an Opera GX tab, but to get a proper app window and Start-menu icon, install it with Edge:

1. Open your app address in **Microsoft Edge**. From Opera GX: open the app, go to **Install app**, and click **Open in Edge**.
2. Click the **App available** icon at the right of the address bar (a square with a plus), then **Install**. Or use the **⋯** menu → **Apps** → **Install Cyber Logbook**.
3. To pin it: right-click its taskbar icon → **Pin to taskbar**.

> Opera GX and the installed Edge app each keep **their own copy** of your data. Either use the installed app only, or turn on Sync in both.

### Android phone: Chrome

1. Open your app address in **Chrome**.
2. Tap **⋮** (top right) → **Install app**. On some versions it's **Add to Home screen** → **Install**.
3. Confirm. The icon appears on your home screen and in your app drawer.

After installing, the app opens and works with **no internet**.

## 4. Set up sync between PC and phone (free)

Sync uses one JSON file in a **secret Gist** on your GitHub account. Each device merges by entry, and the newest edit wins. Deleting an entry on one device deletes it on the other.

**Make a token (do this once per device):**
1. Go to <https://github.com/settings/personal-access-tokens/new>. The long way: profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Cyber Logbook PC` (then `Cyber Logbook phone` for the second one). **Expiration:** 1 year. Put a reminder in your calendar to renew it.
3. **Repository access:** leave it on **Public repositories** (read-only). The app doesn't need any repository.
4. **Permissions → Account permissions → Gists → Read and write.** On the newer layout: **Add permissions** → tick **Gists** → **Read and write**. Leave everything else on **No access**.
5. Click **Generate token** and copy it. It starts with `github_pat_`, and GitHub only shows it once.

**Connect:**
1. **PC first:** open the app → **Settings → Sync** → paste the token → **Connect and sync**. A secret Gist called *Cyber Logbook sync data* is created.
2. **Then the phone:** same steps with the phone's token. It finds the same Gist and merges both devices.
3. From then on, the app syncs when it opens, when you switch back to it, and a couple of seconds after each save. The cloud icon at the top shows the last sync time; tap it to sync now.

**Good to know**
- The token is stored only on that device. It's never shown again, logged, exported or put in backups. To revoke it, delete it on the GitHub token page.
- "Secret" Gists are **unlisted, not encrypted**. Anyone with the exact Gist link could read it. Don't share the link, and never store real-life passwords in the app. Wargame flags are fine.
- If you edit the *same* entry on both devices before they sync, the later edit wins. Different entries are always kept.

### Screenshot sync (a private repository, also free)

Screenshots are too big for a Gist, so each image is stored once as its own file in a **private** GitHub repository. A device only downloads the images it doesn't already have. This runs in the background after text sync, so your entries never wait for pictures. Its progress shows in Settings and on the cloud button at the top. If you're offline, it carries on when you're back online.

1. **Make the repository:** go to <https://github.com/new>. Name: `cyber-logbook-data`. Choose **Private** (important). Tick **Add a README file**. Click **Create repository**.
2. **Let your token use it:** go to <https://github.com/settings/personal-access-tokens>, click your **Cyber Logbook PC** token, then **Edit**. Editing keeps the same token, so there's nothing to paste again.
   - **Repository access:** **Only select repositories** → pick `cyber-logbook-data`.
   - **Repository permissions → Contents → Read and write.** "Metadata: Read-only" is added automatically. Keep **Gists: Read and write**.
   - Click **Update**. Do the same for your **Cyber Logbook phone** token.
3. In the app on your **PC**: **Settings → Screenshot sync** → type `cyber-logbook-data` → **Connect screenshot sync**. Then do the same on your **phone**.

Good to know:
- The app refuses to use a repository that isn't private.
- If you'd rather have a separate token just for screenshots, make a fine-grained token with only `cyber-logbook-data` and **Contents: Read and write**, and paste it under **Advanced** in that section.
- Deleting a screenshot removes it from the entry everywhere at the next sync, and from the repository after a couple of minutes (that short wait lets **Undo** work). GitHub still keeps old versions in the repository's **history**. To erase those too, delete the repository on GitHub and create a fresh one with the same name.
- Update the app on **both** devices before editing entries that have screenshots. An old copy of the app doesn't know about screenshots and would drop them from any entry it saves.

## 5. Screenshots

Every entry has a **Screenshots** section, below "Commands I used".

- **PC:** take a snip with **Win+Shift+S**, then press **Ctrl+V** anywhere on the entry form. You can also drag image files onto the page, or click **Choose images**.
- **Android:** tap **Gallery or camera**, or **Take a photo** to go straight to the camera.
- **Check and black out:** every screenshot first opens on a check screen. Drag across anything private (passwords, flags, tokens, IP addresses) to cover it with a black box. **Undo** and **Clear** are there if you slip. Only the covered-up version is saved. The original is never stored, and re-saving the image also strips hidden data such as GPS location from phone photos.
- **Compression:** anything wider than 1920 px is shrunk to 1920 px and saved as WebP (or JPEG on browsers without WebP) at high quality, so terminal text stays readable while your phone doesn't fill up.
- **Captions and order:** each screenshot has an optional caption. Reorder with the up/down arrows, or drag the handle on a PC.
- **Full screen:** tap a thumbnail to open it full screen.
  - **Move between screenshots:** swipe, or press the ← → keys.
  - **Zoom:** pinch, scroll the mouse wheel, press + / −, or double-tap.
  - **Close:** press **Esc** or tap ✕.
  - **Delete:** use the bin button. It asks for confirmation on the page, and you can **Undo** straight after.
- **Journal:** entries with screenshots show a 📷 count. **Filters → Only entries with screenshots** lists just those.

## 6. Back up your data

Settings → **Backup and export**:
- **Export full backup (.zip):** everything, in one file. It contains `backup.json` (your entries and settings) and an `images/` folder with your screenshots. Your tokens are never included. Keep a copy somewhere safe (OneDrive, Google Drive, a USB stick) every so often.
- **Import a backup:** restores a `.zip` backup, or an older `.json` backup from before screenshots existed, by merging. It adds missing entries and screenshots and updates older entries, and never wipes newer work.
- **Export Markdown (.zip):** for your Obsidian vault.
  - One `.md` per entry, with YAML front-matter and commands as fenced code blocks.
  - Screenshots go in `attachments/` and are embedded as `![[attachments/<file>]]` with the caption underneath.
  - A cheat sheet and an index are included too.
  - Flags are left out unless you tick the box.
- On Android, the share sheet opens if Chrome can share that file type. Chrome currently can't share `.zip` files, so they go to your **Downloads** folder.
- Settings → **This device** shows how much storage the app uses (entries and screenshots) and whether the browser has marked it **persistent**, meaning it won't clear it to save space.

**Reset** (Settings → Reset) wipes this device after an on-page confirmation where you type `RESET`.
- It first downloads `cyber-logbook-before-reset-….zip` automatically, including your screenshots, and an **Undo reset** button appears straight after.
- It then asks separately whether to wipe the synced copy too: the Gist and the screenshots in your repository.
- If you do, your other device will ask before removing or re-uploading anything.

## 7. Putting an update online

When the app changes, these are the steps to publish it (the same drag-and-drop as the first upload):

1. Open your repository on GitHub, e.g. `https://github.com/YOUR-USERNAME/cyber-logbook`.
2. Click **Add file → Upload files**.
3. In File Explorer, open the `Cyber-logbook` folder, press **Ctrl+A** and drag everything onto the page. Files with the same name replace the old ones; new files are added.
   - If a `tests\node_modules` folder exists, leave it out (it's only for the tests and has thousands of files).
4. Wait for the list to finish, then click **Commit changes**.
5. Wait 1–2 minutes. **Actions** (top of the repo) shows a green tick when GitHub Pages has published it.

**Check each device has the new version:**
1. Open the installed app (close it fully first, then reopen).
2. A **"New version available"** message appears at the top within a few seconds. Tap **Tap to update**. If it doesn't appear, close and reopen the app once more; it checks every time it's opened or brought back to the front.
3. Go to **Settings → This device**. It shows **App version** (for example `1.1.0`). Do this on the PC (the Edge app), the phone (the Chrome app) and in Opera GX if you use it there.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Can't open its storage" | You're probably in a private/incognito window, or site data is blocked. Use a normal window. |
| The app didn't update | Close and reopen it, then tap **Tap to update** on the "New version available" message. Did you bump `VERSION` in `sw.js`? |
| Sync says the token was rejected | It expired or was deleted. Make a new one and paste it in Settings → Sync. |
| Sync says "not allowed to use Gists" | The token needs **Gists: Read and write**. |
| Screenshot sync "Can't find …data" | Check the name, and that the token has **Repository access → Only select repositories → cyber-logbook-data**. |
| Screenshot sync "not allowed to change that repository" | The token needs **Repository permissions → Contents → Read and write**. |
| A screenshot says "Not on this device yet" | Your other device hasn't uploaded it yet (open the app there while online), or screenshot sync isn't set up on this device. |
| No "Install" option in Edge/Chrome | Make sure you're on the `https://…github.io/…` address (not `file://`), and wait a few seconds after it loads. |

## For the curious: the tests

The `tests/` folder has a Playwright test suite covering:
- every screen, on phone and desktop sizes up to 2560×1440, in light and dark;
- automated accessibility (axe) checks, including the redact screen and viewer, and tap-target sizes;
- installability, offline use, and the "New version available" update flow;
- screenshots:
  - adding them by paste, upload and drag and drop;
  - redaction: the blacked-out pixels are checked in the saved file;
  - compression to 1920 px WebP;
  - the viewer and zoom, reordering, deleting with Undo, and drafts;
  - the database upgrade from the first version;
- two separate browser profiles syncing entries and screenshots through a (simulated) Gist and private repository, including deletes and coming back online;
- export/import (Markdown attachments, backup zip), hostile import files and reset/undo.

It isn't needed to use the app. To run it you need [Node.js LTS](https://nodejs.org/):

```bash
cd tests
```
```bash
npm install
```
```bash
npx playwright install chromium
```
```bash
npx playwright test
```

Set `CL_BASE=/cyber-logbook/` to test from a sub-folder like GitHub Pages. Set `CL_BROWSER` to a browser's `.exe` (e.g. Opera GX's `opera.exe` or Edge's `msedge.exe`) to run the suite inside that browser.
