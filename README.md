# Bluesky Moderation Helper

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

1. Visit the [Bluesky Moderation Helper Add-on Page](https://addons.mozilla.org/).
2. Click "Add to Firefox" to install the extension.
3. Follow the on-screen instructions to complete the installation.

### Manual Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/rFoxen/BlueskyModerationExtension.git
 
## 🚀 **Usage**

1. **Login**:
   - Open the extension popup by clicking the icon in the toolbar.
   - Enter your Bluesky credentials to log in.

2. **Select a Block List**:
   - Choose a block list from the dropdown menu in the popup.

3. **Block a User**:
   - Right-click on a user or their content and select "Block User."

4. **Enjoy Visual Feedback**:
   - Watch dynamic particle explosions and animated text when blocking users.

5. **Logout**:
   - Click the "Log Out" button in the popup to log out.
     
## 🧩 **Development**

### Prerequisites
- **Node.js** (for optional build tools and dependency management).
- **Firefox Browser** (for extension testing).
- **Code Editor** (VSCode or Sublime Text recommended).

### File Structure
1. **Clone the Repository**:
    ```bash
    BlueskyModerationHelper/
    |--- icons/
    |   |-- icon-48.png
    |   |-- icon-128.png
    |   |-- icon.png
    |-- content_scripts/
    |   |-- moderation.js
    |   |-- effects.css
    |-- popup/
    |   |-- popup.html
    |   |-- popup.js
    |   |-- popup.css
    |-- manifest.json
    |-- README.md
    |-- LICENSE

### Key Components

- manifest.json: Defines the extension's metadata, permissions, and resources.
- content_scripts/moderation.js: Handles interactions within Bluesky pages, including capturing cursor positions and triggering animations.
- content_scripts/effects.css: Styles for animations and visual effects.
- popup/: Contains the UI for logging in, selecting block lists, and managing sessions.
- background.js: Manages background processes, API interactions, and communication between scripts.

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

   ![Extension Popup](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step1.png)
   
   ![Extension Popup](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step2.png)
   
   ![Extension Popup](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step3.png)

*The extension popup interface showing login and block list selection.*

   ![Blocking Animation](https://raw.githubusercontent.com/rFoxen/BlueskyModerationExtension/main/images/Step4.png)

*Dynamic particle explosion and animated text upon blocking a user.*

---

### 📝 **Changelog**

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