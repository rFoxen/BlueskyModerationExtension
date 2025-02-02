﻿# Bluesky Moderation Helper

Bluesky Moderation Helper is a Firefox extension that enhances moderation on [Bluesky](https://bsky.app/). It allows moderators to quickly block users, manage block lists, and enjoy engaging visual feedback during the blocking process.

## 🌟 **Features**

- **Quick Blocking & Context Menu Integration**:
  - Block users instantly via the right-click context menu.

- **Block List Management**:
  - Select specific block lists to add users to, ensuring effective moderation.

- **Engaging Visual Feedback**:
  - Fun particle explosions and animated text appear when blocking users.

- **Cross-Platform Compatibility**:
  - Works seamlessly on both `bsky.app` and `bsky.social`.


## 🛠 **Installation**

### From the Firefox Add-ons Store

1. Visit the [Bluesky Moderation Helper Add-on Page](https://addons.mozilla.org/en-CA/firefox/addon/bluesky-moderation-extension/).
2. Click "Add to Firefox" to install the extension.
3. Follow the on-screen instructions to complete the installation.

### Manual Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/rFoxen/BlueskyModerationExtension.git
   cd BlueskyModerationExtension
 
2. **Install Dependencies: Ensure Node.js is installed. Then run**:
   ```bash
   npm install

3. **Build the Extension**:
    - For development
    
        ```bash
        npm run build:dev

    - For production
        ```bash
        npm run build:prod

4. **Load the Extension in Firefox**:
    - Open about:debugging#/runtime/this-firefox in Firefox.
    - Click "Load Temporary Add-on" and select the manifest.json file in the dist folder.

## 🚀 **Usage**

1. **Login**:
   - Open the extension slideout by clicking the new menu icon in the bsky.app website.
   - Enter your Bluesky credentials to log in.

2. **Logout**:
   - Click the "Log Out" button in the popup to log out.
   
3. **Select a Block List**:
   - Choose a block list from the dropdown menu in the popup.

4. **Block a User**:
   - Click on the "Block" buttons beside the user you want to block.
   
5. **Unblock a User**:
   - Click on the "Unblock" buttons beside the user you want to unblock.
   
5. **Report a User**:
   - Click on the "Report" buttons beside the user you want to report.

6. **Hide block buttons**:
   - Toggle the "Show Block Buttons" toggle.
   
   
## 📂 File Structure
1. **Clone the Repository**:
    ```bash
    BlueskyModerationHelper/
    |-- dist/                   # Compiled files for distribution
    |-- src/                    # Source code
    |   |-- background.ts       # Background script
    |   |-- content.ts          # Main content script
    |   |-- components/         # Modular components (UI, utilities, etc.)
    |-- public/                 # Static assets (manifest, icons, styles)
    |-- webpack/                # Webpack configuration files
    |-- package.json            # Dependencies and scripts
    |-- tsconfig.json           # TypeScript configuration
     
## 🧩 **Development**

### Prerequisites
- **Node.js** Version 16.0.0 or later.
- **npm** Installed alongside Node.js.
- **Firefox Browser** (for extension testing).
- **Code Editor** (VSCode or Sublime Text recommended).


### Development Workflow

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/rFoxen/BlueskyModerationExtension.git
   cd BlueskyModerationExtension

2. Open the Project in Your Editor:
    - Use your preferred code editor to explore and modify the files.

3. Test the Extension:
    - Follow the manual installation steps above to load the extension temporarily in Firefox.
    - Test all features to ensure they work as expected.

4. Make Changes and Commit:
    ```bash
    git add .
    git commit -m "Your commit message"
    git push origin main

5. Iterate Based on Feedback:
    - Collect feedback from testers or users.
    - Implement improvements and bug fixes as needed.
    
---

### 🤝 **Contributing**

Contributions are welcome! To contribute:

1. Fork the Repository:
   - Click the "Fork" button on the GitHub repository page.

2. Create a Feature Branch:
    ```bash
    git checkout -b feature/YourFeatureName

3. Commit Your Changes:
    ```bash
    git commit -m "Add Your Feature"

4. Push to Your Fork:
    ```bash
    git push origin feature/YourFeatureName

5. Open a Pull Request:
    - Navigate to the original repository and click "New Pull Request."
    - Describe your changes and submit.
    
---

### 📜 **License**

This project is licensed under the MIT License. See the LICENSE file for details.

---

### 📸 **Screenshots**

*Login/Logout.*


   ![Extension Login](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step1.png)
   
   ![Extension Logout](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step2.png)
   
   
*Block list download.*
   
   ![Extension Download](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step3.png)

   ![Extension Download Complete](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step4.png)
   
*Searching user.*

   ![Blocking Searching](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Search.png)
   
*The extension interface showing block.*
   
   ![Blocking Block](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step5.png)
   
*The extension interface showing unblock.*

   ![Blocking Unblock](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step6.png)
   
*Create offline backup.*
   
   ![Extension Backup](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/CreateBackup.png)

*Restore from offline backup.*

   ![Extension Restore](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/RestoreBackup.png)
   
*Reporting user.*
   
   ![Blocking Report](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Report1.png)
   
   ![Blocking Report](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Report2.png)
   
*Darkened block styles.*
   
   ![Blocking Darkened](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedDarkStyle.png)
   
*Compact block styles.*

   ![Blocking Compact](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedCompactStyle.png)
   
*Blurred block styles.*

   ![Blocking Blur](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedBlurStyle.png)
   
*Hidden block styles.*

   ![Blocking Hidden](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedHiddenStyle.png)

*Effect of blook stype without additional block lists selected*

   ![AdditionalBlocking none](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedWithoutAdditionalBlocklistStyleSelection.png)
   
*Effect of blook stype with additional block lists selected*

   ![AdditionalBlocking with](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/BlockedWithAdditionalBlocklistStyleSelection.png)
   
*Insert injected elements below posts*

   ![AdditionalBlocking Options1](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/InsertBelowPost.png)
   
*Hide all Insert injected elements*

   ![AdditionalBlocking Options2](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/OptionsToggledOff.png)
   
*Show only Block button injected element*

   ![AdditionalBlocking Options3](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/OnlyBlockButton.png)

---

### 📝 **Changelog**

### v2.0.2
- Fixes: error causing client side browser crash.
- Improvement: fully hides injected layout when all components hidden
- Change: removes outline border

### v2.0.1
- Fixes: Fixes infinite block list completion screen

### v2.0
- Fixes: Better list downloading (automatic pause and resume)
- Feature: Adds ETA and additional context when downloading lists
- Feature: Adds display options for freshness, blocked post appearance, and additional block list selection
- Feature: Adds manual block by userhandle input
- Feature: Adds link to currently selected list
- Feature: Labeled and Color coded tab based on selected block list
- Feature: Adds account freshness information beside injected buttons
- Feature: Adds list downloading
- Feature: Adds download/restore database for ease of transfer between devices
- Improvement: Better consistency of injected button placement
- Improvement: Utilizes browser database for faster querying of data and better persistence

### v1.5.0
- Fixes: Better session management
- Features: Adds searchable user menu
- Features: Adds dark/light mode
- Features: Adds toggle for block buttons
- Features: Adds unblock functionality
- Improvements: Implements official @atproto/api library for session management.

### v1.4.1
- LoginFunction now part of the injected Moderation Helper slide-out
- Removes unneeded Options/popout code 

### v1.4

- Adds mobile functionality:
    - Block handling moved to physical button:
        - To facilitate mobile I've moved block functionality to a injected block button
        - Removes right click block user context menu
- Adds top level block list selection:
    - Drop down menu to select current block list that blocks will be sent to
    - Count of users in currently selected block list
- Refactor code following OOP principles

### v1.3.1

- Bug Fix:
    - Fixes bug that autologs out user from extension

- Security Enhancements:
    - Secure Data Handling:
        - Continued implementation of encryption for storing sensitive data such as accessJwt using the Web Crypto API.
    - Input Validation:
        - Added robust input validation to ensure user inputs meet expected formats without altering their actual values.
    - Enhanced Content Security Policy:
        - Further refined the Content Security Policy to tighten security measures and restrict resource loading.

- Performance Improvements:
    - Optimized Notification Handling:
        - Improved the efficiency of batched notifications to enhance user experience without compromising performance.

### v1.3.0

- Enhanced Visual Effects:
    - Introduced professional and fun particle explosions.
    - Improved block list name animations with 3D scaling.
- Persisted Block List Selection:
    - The selected block list now remembers its position across sessions.
- Notifications:
    - Notifications now explicitly state which block list a user was added to.
- Bug Fixes:
    - Resolved issues with API requests and error handling.

### v1.2.0

- Initial Release:
    - Basic functionality for blocking users and managing block lists.
    - Context menu integration and keyboard shortcuts.
    
---

### 🔗 **Useful Links**

Bluesky Official Website
Firefox Developer Hub
AT Protocol Documentation