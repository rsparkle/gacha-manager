# Changelog

# [1.1.6] - 2026-10-20
### Added
- The app now keeps a log file to help diagnose problems when reporting a bug
### Changed
- The accounts file now records its format version, so future updates can convert it safely
- If the accounts file was saved by a newer version of the app, a dialog now offers to download the latest version instead of treating the file as damaged
### Fixed
- Schedule images that failed to load, for example when starting offline, now load once the connection is back instead of staying blank until views are switched

# [1.1.5] - 2026-10-20
### Fixed
- Game data refreshes every 6 hours while the app is running again; since 1.1.4 it only refreshed at launch and when the PC woke from sleep
### Changed
- Updated dependencies, including security fixes for the auto-updater

# [1.1.4] - 2026-10-19
### Added
- Lacrimosa theme
- "Hardware Acceleration" setting for smoother animations at the cost of more memory; after changing it, the app offers to restart right away so it takes effect
### Changed
- The app now uses much less memory while running in the background, since hardware acceleration is off by default
- Themes are now picked from a dropdown in the top bar
- The schedule now remembers which games were toggled on or off, instead of resetting to the games with accounts created
- The app is about 5 MB smaller: theme backgrounds are compressed and unused files are no longer included
- Leftover files from interrupted image downloads are now cleaned up with the image cache
- Settings and confirmation dialogs open faster
### Fixed
- Opening the app from the tray, a notification or a second launch now restores the window when it was minimized
- A problem with one game's data could leave the whole schedule empty; now only that game's events are skipped
- If saving settings failed, the Settings window closed and showed the changes as applied anyway; it now stays open so it can be tried again

# [1.1.3] - 2026-10-18
### Added
- Miyabi theme
- "Background" button in the top bar that closes the window to save memory while the app keeps running
- Clicking a deadline notification now opens the app
- An in-app pill now tells when a new version is available, with a short summary of what changed and buttons to update or dismiss it
- When an update finishes downloading, a "Restart" button installs it right away; otherwise it installs the next time the app is closed
### Changed
- Character themes now have their own small character-inspired decorations
- The window's title bar now matches the selected theme
- The app now always checks for updates. The "Automatic Updates" setting only decides whether they download and install on their own
- The app also checks for updates every 6 hours while it's open, not only at launch
- Minimizing the window now works normally instead of sending the app to the tray

# [1.1.2] - 2026-10-14
### Changed
- Schedule events for the next patch now show that patch's art when it's available, falling back to the default art
- Old cached images are now cleaned up in the background, which will make the app start faster
### Fixed
- Task completion percentage counted inactive tasks as done, so progress could look higher than it was and show the "all done" sticker too early
- Images that failed to download (for example when starting offline) stayed broken until the app was restarted; they now load once the connection is back
- The "Game data update skipped" notification repeated every few hours while the online data stayed invalid; it now shows once per update
- Deadline notification checks could run constantly in the background in rare cases

# [1.1.1] - 2026-10-14
### Added
- Furina theme
- Themed loading sticker on the setup screen
- Game data now refreshes in the background every 6 hours and when the PC wakes from sleep, and updates apply without restarting the app
### Changed
- The app now opens instantly using the last downloaded game data instead of waiting for the network
- The schedule now appears instantly; images fill in as they load instead of showing a loading screen
- Countdowns under an hour now show as "5m" instead of "00:05"
- New accounts start on the same server as the account you're viewing, or the game's first server
- Turning on automatic updates in Settings now takes effect right away instead of after a restart
- Web links now open in your default browser, and the app window can no longer navigate to outside pages
### Fixed
- Installer and app now use a proper multi-size icon
- Tasks without an end date showed "00:00" and a broken progress bar; they now show "Ongoing"
- A single broken task in the game data could blank the whole Tasks view and stop notifications; now only that task is disabled
- Game data with invalid task dates or missing maintenance times is now rejected before it is saved
- Switching monthly sub tracking from "daily task" to "calendar" could subtract days retroactively
- Deleting an account now also removes it from notification and automatic daily settings
- Release tooltips for patches with two characters now use the portrait layout
- Deadline notifications could fail with settings saved by older versions
- Images still in use are no longer deleted by the cache cleanup

# [1.1.0] - 2026-10-13
### Added
- Calendar navigation now includes the previous month
- Game event tasks are now supported
- A notification now appears when a game data update is invalid and the last working version is used instead
- Clear error message shows when game data cannot be loaded on launch, instead of the app closing silently
### Changed
- Game data is now validated before it is saved, so a faulty update can no longer replace the last working version
- Schedule images now load in parallel, and images that don't exist are no longer requested again on every refresh
- Seasonal task dates and server time zones in game data are now checked on launch
- Removed the unused Linux and macOS packages
### Fixed
- A faulty game data update could make the app close on launch with no message
- Opening a second copy of the app now exits immediately instead of briefly opening a window
- Editing an account could clear its server or UID in some cases
- A task update that failed halfway could still be saved later with the next change
- accounts.json is now written safely; a crash or power loss while saving can no longer corrupt it
- Automatic dailies now detect the game by its exact process name
- The app's internal file protocols can no longer read files outside the app's own folders
- Tooltip portrait event detection should work properly now

## [1.0.6] - 2026-10-08
### Added
- App icon
- System tray support: minimizing sends the app to the tray, where it keeps running in the background
- Deadline notifications and automatic dailies now keep working while the app is in the tray
### Changed
- Minimizing now fully closes the window to save memory; the app reopens from the tray
- Improved overall app design
- Removed unnecessary game tags from schedule tooltips
### Fixed
- Improved tooltip portrait event detection in schedule

## [1.0.5] - 2026-10-07
### Added
- Added single-instance protection to prevent multiple app windows from running simultaneously
- Added support for reset times tied directly to an anchor timestamp via anchorTime
- Added fallback handling for unknown reset times in external task configuration, defaulting to the daily reset
- Calendar-mode monthly subscription now updates automatically when the app stays open past a daily reset
### Fixed
- Asia server reset calculations now account for the server's shifted reset day
- Deadline notifications now fire again after a task reset
- Deadline notifications are no longer suppressed across accounts with the same task
- Notifications should now appear when deleting cache
- Editing a UID or account label should no longer be interrupted by the automatic minute refresh
- Game monitoring and deadline notifications now work on every screen, not just Tasks
- Cancel in Settings now discards unsaved changes
- Game version should now be displayed in Setup
- A corrupted accounts.json is now detected on launch and the app no longer hangs silently on launch
- Windows notifications now show the app name instead of an internal identifier

## [1.0.4] - 2026-09-29
### Fixed
- Monthly subscriptions now count days according to each account's server reset

## [1.0.3] - 2026-09-28
### Added
- Monthly subscription system added
- Option to reduce the count by calendar day or when a daily task is completed
- Setting to enable or disable automatic update checks
### Fixed
- Tasks completion logic now takes into account disabled tasks 

## [1.0.2] - 2026-09-26
### Changed
- Character trailer dates are now always marked as estimated

## [1.0.1] - 2026-09-26
### Fixed
- Future character trailers not appearing due to duplicate trailer keys

## [1.0.0] - 2026-09-21
### Changed
- Game task definitions are now served remotely from the dedicated repository
- Replaced SQLite storage with JSON-based account and task-completion storage
- Reworked the reset processor to read reset rules from game-tasks.json, reducing the need for direct application updates when task schedules change
- Improved the design across all pages
- Account server can be changed manually regardless of the UID rules
- Remove the number of accounts below gacha titles for a cleaner UI
- Games without accounts are automatically hidden in the calendar by default

## [0.8.9] - 2026-09-18
### Changed
- Replaced emojis with text in calendar pills for better visiblity

## [0.8.8] - 2026-09-05
### Added
- Automatic deletion of old cached assets
- Button to delete all cached assets

## [0.8.7] - 2026-09-04
### Changed
- Calendar UI improved

## [0.8.5] - 2026-09-04
### Fixed
- Preserve version numbers in schedule

## [0.8.4] - 2026-06-21
### Added
- Support for NTE-style livestream scheduling
### Changed
- Refactored schedule processor into focused builder functions

## [0.8.3] - 2026-06-20
### Added
- Patch trailers and drip marketing dates

## [0.8.0] - 2026-05-31
### Changed
- Assets and configuration are now served remotely via a dedicated repository
- Upcoming patches are visually distinct in the schedule page
### Added
- Neverness To Everness logic, data and assets
### Removed
- Arknights Endfield data and assets

## [0.7.9] - 2026-04-16
### Changed
- Livestreams are skipped if no date or prediction is found

## [0.7.8] - 2026-03-31
### Added
- Reduced opacity for unconfirmed events

## [0.7.7] - 2026-03-31
### Fixed
- Skip falsy image paths in fallback chain

## [0.7.6] - 2026-03-31
### Improved
- Optimized asset loading by falling back to previous version images when newer ones are unavailable

## [0.7.5] - 2026-03-28
### Updated
- Updated schedule for March 28
### Added
- Persist schedule server selection
### Fixed
- Improve title list in schedule

## [0.7.4] - 2026-03-28
### Fixed
- Fixed server name and selection in setup

## [0.7.3] - 2026-03-28
### Added
- Added more tasks
### Fixed
- Fixed schedule inconsistencies for new titles

## [0.7.2] - 2026-03-25
### Updated
- Updated schedule for March 25

## [0.7.1] - 2026-03-25
### Added
- Added more games

## [0.7.0] - 2026-03-23
### Added
- Calendar Page

## [0.6.7] - 2026-03-13
### Added
- Page footer

## [0.6.2] - 2026-03-12
### Fixed
- Auto-generates latest.yml on publish for electron-updater compatibility

## [0.6.0] - 2026-03-12
### Fixed
- Switched from Squirrel to NSIS installer for reliable auto-update support

## [0.5.3] - 2026-03-11
### Fixed
- Replaces electron-updater with update-electron-app

## [0.5.1] - 2026-03-11
### Added
- Theme selection now persists between sessions

## [0.5.0] - 2026-03-11
### Added
- Auto-update and installer 

## [0.4.0] - 2026-03-11
### Added
- Completed tasks list for the current set of games

## [0.3.1] - 2026-03-10
### Fixed
- Remove accounts from the settings when deleted

## [0.3.0] - 2026-03-10
### Added
- Auto-detect running games to automatically complete daily tasks

## [0.2.1] - 2026-03-08
### Added
- Urgent pulse orb indicator on game items

## [0.2.0] - 2026-03-08
### Added
- Windows desktop notifications for urgent tasks

## [0.1.0] - 2026-03-06
### Added
- Initial release
