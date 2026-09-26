# Changelog

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
