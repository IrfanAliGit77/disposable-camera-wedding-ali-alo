![Made with Love](https://img.shields.io/badge/Made%20with-Love-ff69b4?style=for-the-badge) ![Free](https://img.shields.io/badge/Cost-Rp%200-brightgreen?style=for-the-badge) ![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue?style=for-the-badge) ![Google Drive](https://img.shields.io/badge/Storage-Google%20Drive-34A853?style=for-the-badge)

# 📸 Ali & Alo — Wedding Disposable Camera

> *A digital disposable camera for weddings. Guests scan a QR code, get one "roll of film", and every shot lands in a shared album — built with pure HTML, CSS, and JavaScript. No app to install. No account. No monthly fee.*

[🌐 Live Demo](https://irfanaligit77.github.io/disposable-camera-wedding-ali-alo/?e=testing-event) · [✨ Features](#-features) · [🚀 Setup Guide](#-getting-started) · [📏 Limits](#-limits--scaling) · [💕 Dedication](#-for-alodia)

---

## 🎯 Overview

This is a **self-hosted, open-source** disposable-camera web app, first built for the wedding of **Muh. Irfan Ali** and **Alodia Kinanti Faruqa** on **December 25, 2026** in **Kediri, East Java, Indonesia**.

Guests open a link or scan a QR code, type their name, and start shooting. Each photo gets a film look right on the guest's phone, then goes straight into **your own Google Drive**. The album can stay locked until a reveal time, like waiting for film to be developed, or run live during the event.

One installation serves **many events**. Each event gets its own Google Sheet tab, its own Drive folder, its own link and QR code, and its own settings.

The backend is **Google Sheets + Google Apps Script + Google Drive**. There is no server to rent and no database to pay for.

> Companion project: [Ali & Alo — Wedding Invitation](https://github.com/irfanaligit77/our-wedding-invitation-ali-alo), which shares the same sage-and-gold theme.

---

## ✨ Features

### For guests

| # | Feature | Description |
|---|---------|-------------|
| 📱 | **No install, no login** | Scan the QR code, type a name, shoot. Works in the phone browser. |
| 🎞️ | **One roll of film** | Each phone gets a limited number of shots per event (default 27). |
| 🎨 | **8 film filters** | Klasik (default), Hitam Putih, Noir, Sepia, Senja, Sejuk, Pudar, Cerah. Warm tone, grain, vignette, occasional light leak, and an orange date stamp. |
| 🎬 | **Filtered video** | The same filters are baked into recorded video, with sound. Each guest has a **total** video budget (default 5 minutes) that can be split across several clips. |
| 🤳 | **Front and back camera** | Selfies are saved the right way round, so text and the date stamp read normally. |
| ⚡ | **Flash** | Uses the phone torch on the back camera, and a bright screen on the front camera. |
| 🖼️ | **Upload from phone gallery** | Original files of any size. Does not use up the film roll. |
| 📶 | **Survives bad signal** | Shots are saved on the phone first and sent in the background. Interrupted uploads resume where they stopped. |
| 👀 | **Instant own shots** | A guest's own photos appear in the album immediately, even while still uploading. |

### Album

| # | Feature | Description |
|---|---------|-------------|
| 🔒 | **Surprise mode** | The album stays locked with a countdown until the reveal time. Guests see only their own shots until then. |
| 🔴 | **Live mode** | Everything appears as it is taken. The album refreshes itself every 15–20 seconds. |
| 🔍 | **Lightbox** | Full-screen view, swipe between photos, download the original file. |
| ▶️ | **Native video player** | Videos play in the phone's own player. |
| 📺 | **Big-screen slideshow** | For a TV or projector at the venue. New photos jump the queue. |

### For the host

| # | Feature | Description |
|---|---------|-------------|
| 🗂️ | **Multiple events** | Create, rename, and delete events from one dashboard. |
| 🧾 | **Auto tab and folder** | Creating an event creates a Sheet tab and a Drive folder with the event's name. |
| 🔳 | **QR code per event** | Print-ready card and a copy-link button. Renaming an event does not change its QR code. |
| 💑 | **Cover photo** | The couple's photo, shown in a gold-ringed circle on the guest page. |
| ⚙️ | **Per-event settings** | Shots per guest, video budget, album mode, reveal time, gallery uploads, date stamp. |
| 🚦 | **Open / close camera** | One button. Takes effect for all guests at once. |
| 🙈 | **Moderation** | Hide or delete any submission. |
| 📊 | **Statistics** | Photos, videos, guests, total size, and a per-guest tally. |
| 🔑 | **Client PIN** | An optional per-event PIN lets a client manage only their own event. |

---

### 📡 How a Photo Travels

```
Guest presses the shutter
    │
    ├── Filter applied on the phone (canvas / WebGL)
    │
    ├── Saved on the phone (IndexedDB) ──► shown in "my shots" right away
    │
    ├── Small file (photo, short video, up to 5 MB)
    │       └──► one call to Apps Script ──► saved to Drive + logged in the Sheet
    │
    └── Large file (long video, gallery upload)
            └──► Apps Script issues a one-time upload ticket
                    └──► phone uploads straight to Drive in 4 MB chunks
                            └──► Apps Script logs it in the Sheet

Album (once revealed)
    └──► reads the file list straight from Google Drive with an API key
         (Apps Script is asked only once per visit)
```

Why it is built this way: Apps Script has daily and concurrency limits that are shared by **all** guests, because the web app runs as the host's account. Small files skip the "URL Fetch" quota entirely, and the album skips Apps Script almost completely, so the script's capacity is spent on receiving photos.

---

## 🛠️ Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | HTML + CSS + Vanilla JavaScript | Free |
| Photo filter | Canvas 2D | Free |
| Video filter | WebGL + `MediaRecorder` | Free |
| Offline queue | IndexedDB + Web Locks | Free |
| Fonts | Google Fonts (Cormorant Garamond, Jost) | Free |
| QR code | qrcode-generator | Free |
| Backend | Google Apps Script | Free |
| Database | Google Sheets | Free |
| Storage | Google Drive | Free up to your Drive quota |
| Album listing and video playback | Google Drive API (API key) | Free within quota |
| Hosting | GitHub Pages | Free |

No frameworks. No build tools. No npm.

---

## 🚀 Getting Started

### Prerequisites

- A GitHub account
- A Google account. Its Drive is where the photos are stored.
- About 20 minutes

### Step 1: Fork & Clone

```bash
# Fork this repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/disposable-camera-wedding-ali-alo.git
cd disposable-camera-wedding-ali-alo
```

### Step 2: Set Up the Backend

**2a.** Open <https://sheets.new> and name the spreadsheet, for example `Disposable Camera Data`.

**2b.** Go to **Extensions → Apps Script**.

**2c.** Delete the default code and paste the contents of `apps-script/Code.gs`.

**2d.** Change the admin PIN at the top of the file:

```javascript
const ADMIN_PIN = 'GANTI-PIN-INI';   // change this
```

**2e.** Click **Save**, choose the function **`setup`**, and click **Run**. Authorize when prompted (click "Advanced" → "Go to ... (unsafe)" → "Allow"). The log should end with `SETUP SELESAI`.

**2f.** Click **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**

**2g.** Copy the Web app URL (it ends in `/exec`). Opening it in a browser should show `{"ok":true,"app":"disposable-camera",...,"ready":true}`.

> ⚠️ **Important:** After editing the Apps Script code, use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL. A "New deployment" would create a different URL.

> 🔐 `apps-script/Code.gs` contains your PIN once you edit it. Do not commit your edited copy to a public repository.

### Step 3: Create a Drive API Key

The album and the video player read from Drive with an API key. Without it the app still works, but the album goes through Apps Script and videos fall back to a "Play in Google Drive" button.

1. Open <https://console.cloud.google.com> and create a project.
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key:
   - **Application restrictions → Websites:** `https://YOUR_USERNAME.github.io/*`
   - **API restrictions → Restrict key:** Google Drive API only

The key is visible in your public repository. That is expected for this kind of key, and the two restrictions above are what keep it safe.

### Step 4: Configure

Edit `assets/js/config.js`:

```javascript
window.WC_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  DRIVE_API_KEY: 'AIza...',     // from Step 3
  DEFAULT_EVENT: '',            // optional: event code used when the link has no ?e=
  MIRROR_SELFIE: false,         // true = save selfies mirrored, as seen on screen
  INVITATION_URL: ''            // optional: link back to your invitation
};
```

### Step 5: Deploy to GitHub Pages

```bash
git add .
git commit -m "setup: wedding disposable camera"
git push origin main
```

1. Go to your repository on GitHub
2. Click **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: **main**, folder: **/ (root)**
5. Click **Save**

Your pages will be live at:

```
Guests     https://YOUR_USERNAME.github.io/disposable-camera-wedding-ali-alo/?e=EVENT-CODE
Album      https://YOUR_USERNAME.github.io/disposable-camera-wedding-ali-alo/gallery.html?e=EVENT-CODE
Dashboard  https://YOUR_USERNAME.github.io/disposable-camera-wedding-ali-alo/admin.html
```

> The camera only works over `https://` or `localhost`. To test on a laptop, use the VS Code **Live Server** extension instead of double-clicking `index.html`.

### Step 6: Create Your Event

1. Open `admin.html` and sign in with your PIN.
2. Enter the event name and date, then click **Buat Event**. A Sheet tab and a Drive folder are created with that name.
3. Upload a **cover photo**.
4. Print the **QR card** or copy the guest link.
5. Adjust the settings if needed.

---

## 🎨 Customization

### Color Scheme

The palette matches the wedding invitation: **Sage Green & Gold**. Change it in `assets/css/style.css`:

```css
:root {
  --sage: #8B9D77;        /* Primary green */
  --sage-dark: #6B7D5A;   /* Dark accent */
  --cream: #FAF6F0;       /* Background */
  --gold: #C9A96E;        /* Gold accent */
  --ink: #282a25;         /* Camera screen background */
}
```

### Film Filters

Each filter is one entry in `Film.FILTERS` inside `assets/js/film.js`. The same numbers drive both photos and video:

```javascript
{ id: 'klasik', name: 'Klasik', dot: '#c98a4b',
  contrast: 0.38, lift: 0.035,                       // S-curve strength, lifted blacks
  r: [1.05, 0.012], g: [1.0, 0.004], b: [0.9, 0.022], // [multiply, add] per channel
  sat: 1.14, grain: 20, vignette: 0.42, leak: 0.3,
  css: 'contrast(1.06) saturate(1.14) sepia(0.14) brightness(1.03)' }  // live preview
```

Add a new object to the list and it appears in the filter strip.

### Default Event Settings

New events start from `DEFAULT_SETTINGS` in `apps-script/Code.gs`. Everything there can also be changed per event from the dashboard.

---

## 📁 Project Structure

```
disposable-camera-wedding-ali-alo/
├── index.html              ← Guest page: welcome + camera
├── gallery.html            ← Album + slideshow
├── admin.html              ← Event list + per-event dashboard
├── assets/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── config.js       ← The only file you must edit
│       ├── common.js       ← API calls, uploads, offline queue, Drive listing
│       ├── film.js         ← Photo and video filters
│       ├── camera.js
│       ├── gallery.js
│       └── admin.js
├── apps-script/
│   └── Code.gs             ← Backend (paste into Google Apps Script)
└── README.md               ← You are here
```

In Google, after setup:

```
Google Sheet                         Google Drive
├── _Events   (one row per event)    └── Disposable Camera Events/
├── Ali & Alo (one row per shot)         ├── Ali & Alo/
└── ...                                  │   ├── 20261225-101500_Dinda_ab12cd.jpg
                                         │   └── _tersembunyi/   (hidden by admin)
                                         └── ...
```

---

## 📏 Limits & Scaling

These are Google's limits, and they are shared by **all guests** because the web app runs as the host's account.

| Limit (consumer Google account) | Value | What it means here |
|---|---|---|
| Apps Script simultaneous executions | 30 | Roughly 10–20 uploads per second. Extra uploads wait on the phone and retry automatically. |
| Apps Script URL Fetch calls | 20,000 / day | Used only by large files, one call each. Photos and short videos use none. |
| Apps Script Properties read/write | 50,000 / day | IDs are cached, so this is barely touched. |
| Drive API | 1,000,000 units / minute | A list call costs 100 units. A thousand guests browsing the album use about 4,000 calls per minute. |
| Storage | Your Drive quota | A photo is about 0.3–1 MB. A minute of video is about 20 MB. |

Practical advice for a large wedding:

- **Run a rehearsal** with 10–20 phones shooting at once before the day. The capacity figures above are estimates, not load-test results.
- **If uploads feel slow during the event**, switch the album to surprise mode from the dashboard. It takes effect at once and frees capacity for uploads.
- **Shot limits are per browser.** A guest who clears browser data or switches browsers gets a new roll.
- **Upload pauses while the phone screen is locked.** It resumes when the page is opened again.

---

## 🍴 Want to Use This for Your Wedding?

Fork this repository and make it yours! Quick checklist:

- [ ] Fork the repository
- [ ] Create a Google Sheet, paste `Code.gs`, set your PIN
- [ ] Run `setup` and deploy as a Web app
- [ ] Create a restricted Drive API key
- [ ] Fill in `assets/js/config.js`
- [ ] Deploy to GitHub Pages
- [ ] Create your event in `admin.html` and upload a cover photo
- [ ] Test on a real Android phone and a real iPhone
- [ ] Rehearse with a group of friends
- [ ] Print the QR card and put it on the tables
- [ ] After the wedding: download the Drive folder as a backup 🎉

---

## ❓ FAQ

**Is this really free?**
Yes. GitHub Pages, Apps Script, Sheets, and the Drive API are free within their quotas. The only thing that can run out is your Drive storage.

**Is there a file size limit?**
Not per file. Large files are uploaded straight to Drive in chunks. The total is limited by your Drive storage.

**Why Google Drive and not GitHub for storage?**
Writing to GitHub needs a secret token, and a static site cannot keep a secret. GitHub also limits files to 100 MB and recommends small repositories.

**Can guests see each other's photos before the reveal?**
No. Before the reveal, the server gives each phone only its own shots, and the Drive folder ID is not sent to guests.

**Is the Drive folder public?**
Each event folder is shared as "anyone with the link can view". This is needed for photos to show in the album. After the reveal, guests' phones know the folder ID, so treat the album as visible to anyone who has the link. Hidden items are moved to a subfolder that the album does not list.

**The camera does not open inside WhatsApp or Instagram.**
Some in-app browsers block the camera. The app then shows a **Buka Kamera HP** button that uses the phone's own camera, and the filter is still applied. Opening the link in Chrome or Safari also works.

**Photos stay on "mengirim…" for a long time.**
If something is delayed, the status line turns orange and shows the reason. Tap it to retry now. Common causes are a weak signal and a busy server, and both recover on their own.

**Videos do not play in the album.**
Check that `DRIVE_API_KEY` is set and that its website restriction matches your site's address.

**Do I need to redeploy after changing settings?**
No. Settings are saved from the dashboard and apply at once. Only changes to the Apps Script **code** need a new version.

**What happens when I delete an event?**
Its Sheet tab is removed and its Drive folder goes to the Trash, where it can be restored for 30 days.

---

## 📜 License

MIT License — free to use, modify, and distribute.

---

## 💕 For Alodia

*The invitation was my love letter to you, written in code. This one is a promise: that I will not let a single moment of our day slip away unseen.*

*I have loved you since a train factory in Madiun, where the engines were deafening and my heart was somehow louder. I did not own a camera that could have kept that afternoon. I only have it the way memory keeps things: a little blurred at the edges, warm in the middle, and impossible to retake.*

*So much of us lives only like that. The late-night calls where we traded dreams until one of us fell asleep. The storms we walked through shoulder to shoulder. The plans we whispered to no one but each other. No shutter ever closed on those. They are ours, undeveloped, kept in the dark where the best things wait.*

*But on December 25, 2026, I want more than my own memory. I already know what will happen to me that day. You will walk in, and the rest of the room will go out of focus. I will see nothing but you, and I will miss everything else: your father's eyes, our friends laughing, the small beautiful accidents happening just outside my frame.*

*So I built this. A thousand little cameras in a thousand loving hands. Twenty-seven frames each, because love should be spent carefully and all at once. Every guest becomes a witness, and every witness holds a piece of the day that I would otherwise lose.*

*They say a photograph is only light that was patient enough to stay. Then let this be a house full of patient light. Let them catch the moment your smile breaks open. Let them catch me forgetting my lines. Let them catch the grain, the blur, and the light leaking in from the corners, because that is what joy really looks like when nobody is posing for it.*

*And when the night is quiet and the album finally opens, we will sit together and watch our wedding develop, frame by frame, through the eyes of everyone who loves us. That is my favourite part. Not the taking, but the waiting, and then the seeing, with you beside me.*

*The invitation counted down the seconds until I could call you my wife. This camera is for everything after: proof, in a thousand small exposures, that it was real, that it was bright, and that I was the luckiest man in every single frame.*

*I love you, Alodia Kinanti Faruqa, in colour and in black and white, in sharp focus and in beautiful blur.*

*— Your husband-to-be,*
**Ali** ❤️

---

**Built with ❤️ by [Muh. Irfan Ali](https://github.com/irfanaligit77) — Ali Software Developer**

*Dedicated to the love of his life, Alodia Kinanti Faruqa*

![Wedding Date](https://img.shields.io/badge/Wedding-25%20December%202026-C9A96E?style=flat-square) ![Venue](https://img.shields.io/badge/Venue-Kediri%2C%20East%20Java-8B9D77?style=flat-square) ![Status](https://img.shields.io/badge/Status-One%20Roll%20per%20Guest%20📸-ff69b4?style=flat-square)

⭐ **Star this repo if you find it useful!**