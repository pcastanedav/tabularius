## Overview

Tabularius is a companion app for Tower Dominion. Automatic backups (local and cloud), run history, save editing, flexible data analysis, fancy plots!

➡️ https://mitranim.com/tabularius/ 🚀

(The feature lists below are mostly bot-generated. Not how I would write it, but fairly accurate.)

## Key Features

- Terminal-style interface with command system
- Automatic game save file tracking and backup
- Local and cloud storage of game history
- Save editing: lock or unlock any part of your meta-progression
- Interactive data visualization and analytics
- Cloud DB integration for global data comparison
- Cross-tab synchronization
- Dark mode support, no flashbang!

## Examples

Default view. Commands can be typed or clicked:

![default view](https://github.com/user-attachments/assets/899e119c-913a-45fb-993f-b6d784e92849)

Data analysis with plots! Arbitrary options can be composed:

![arbitrary plotting options](https://github.com/user-attachments/assets/8a8e9644-5c25-43a6-85bb-d0d8bbc70aa0)

Automatically plots the latest run! Automatically watches the game save, makes backups, and updates the current plot!
- Bonus tip: can change the startup plot behavior via the `?run=` URL query parameter.
- Bonus tip: can have any number of plots at once!
- Note: FS access requires running the `saves` and `history` commands once.

![watching and plotting](https://github.com/user-attachments/assets/ca042028-824e-414b-9ab7-7430d57852b3)

After running `saves` and `history` (to grant FS access) and `auth`, the app automatically uploads your run history to the cloud.
- _Any_ cloud run can be analyzed with `plot`!
- Compare your runs with others'!
- Help the developers balance the game!
- Data is perfectly anonymous, your personal details are secret.

![cloud backups and plots](https://github.com/user-attachments/assets/990bb3fd-fad2-4275-89fe-09b6ec003b66)

Show the content of arbitrary save files, either from the original save folder, or from arbitrary runs and rounds in your history directory:

![show arbitrary save files](https://github.com/user-attachments/assets/93d18598-2f3a-4a30-879b-0d9884c87449)

And more!

## More Features

### Core System

- Terminal emulator interface with command history
- Process management (`ps`, `kill`)
- File system access via Web FileSystem API
- Dark/light mode toggle
- Cross-tab communication

### Backup System

- Automatic detection of game save changes
- Periodic snapshots with deduplication
- Organization by run and round IDs
- Local storage with user-selected directory

### Save Editing

- Unlock or lock the maximum achieved difficulty
- Unlock or lock any commanders, and set their difficulty badges
- Unlock or lock any buildings
- Unlock or lock any doctrines
- See or unsee all weapons

### Data Analysis

- Statistical processing of game save data
- Interactive charts with multiple visualization types
- Filtering, grouping, and aggregation options
- Multiple axis parameter selection
- Preset plot configurations
- Live updates when data changes

### Cloud Features

- Easy authentication
- Upload of local runs to cloud DB
- Global data querying and comparison
- User data isolation and security
- Manual and automatic cloud synchronization

## Development

When hacking on this repo, you might need some setup.

Make sure your system has `make` and `deno`.

On app launch, `deno` will auto-fetch some JS libs as needed, as well as DuckDB dylibs. No manual installation needed.

Create the data directory; default location:

```sh
mkdir data
```

Running in development mode:

```sh
make dev_w
```

Running in production mode:

```sh
make srv
```
