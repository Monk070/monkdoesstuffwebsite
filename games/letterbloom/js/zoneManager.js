// zoneManager.js - Themed zones (one per 10 levels) with crossfading backgrounds.
// Background images are assigned via the .zone-N classes in styles/base.css.
export class ZoneManager {
    constructor() {
        this.currentZone = 1;
        this.zones = [
            { id: 1, name: 'Seaside Beach', background: 'Beach.png', levels: [1, 10] },
            { id: 2, name: 'Cherry Garden', background: 'CherryTreeGarden.png', levels: [11, 20] },
            { id: 3, name: 'Cosy Cabin', background: 'CosyCabin.png', levels: [21, 30] },
            { id: 4, name: 'Desert Oasis', background: 'DesertOasis.png', levels: [31, 40] },
            { id: 5, name: 'Mystic Forest', background: 'Forest.png', levels: [41, 50] },
            { id: 6, name: 'Peaceful Meadow', background: 'Meadow.png', levels: [51, 60] },
            { id: 7, name: 'Mountain Lake', background: 'MountainLake.png', levels: [61, 70] },
            { id: 8, name: 'Rolling Hills', background: 'RollingHills.png', levels: [71, 80] },
            { id: 9, name: 'Ancient Ruins', background: 'Ruins.png', levels: [81, 90] },
            { id: 10, name: 'Snowy Village', background: 'SnowyVillage.png', levels: [91, 100] }
        ];

        this.backgroundContainer = null;
        this.currentBackgroundElement = null;
        this.isTransitioning = false;
    }

    init() {
        this.backgroundContainer = document.querySelector('.background-container');
        if (!this.backgroundContainer) {
            this.backgroundContainer = document.createElement('div');
            this.backgroundContainer.className = 'background-container';

            const fallback = document.createElement('div');
            fallback.className = 'background-fallback';
            this.backgroundContainer.appendChild(fallback);

            this.currentBackgroundElement = document.createElement('div');
            this.currentBackgroundElement.className = 'background-image zone-1';
            this.backgroundContainer.appendChild(this.currentBackgroundElement);

            document.body.insertBefore(this.backgroundContainer, document.body.firstChild);
        } else {
            this.currentBackgroundElement = this.backgroundContainer.querySelector('.background-image');
        }

        this.createZoneDisplay();
        this.currentZone = 1;
    }

    createZoneDisplay() {
        if (document.querySelector('.zone-text')) return;

        const levelInfo = document.querySelector('.level-info');
        if (levelInfo) {
            const zoneDisplay = document.createElement('div');
            zoneDisplay.className = 'zone-text';
            zoneDisplay.innerHTML = 'Zone: <span id="zone">1</span>';
            levelInfo.appendChild(zoneDisplay);
        }
    }

    getZoneForLevel(level) {
        // Every 10 levels is a new zone; zone 10 repeats beyond level 100
        return Math.min(Math.ceil(level / 10), 10);
    }

    getZoneInfo(zoneNumber) {
        return this.zones.find(z => z.id === zoneNumber) || this.zones[0];
    }

    getCurrentZoneInfo() {
        return this.getZoneInfo(this.currentZone);
    }

    isZoneBoundary(level) {
        return level % 10 === 1 && level > 1;
    }

    async updateZone(level) {
        const newZone = this.getZoneForLevel(level);
        this.updateZoneDisplay(newZone);

        if (newZone !== this.currentZone && !this.isTransitioning) {
            await this.transitionToZone(newZone);
        }
    }

    updateZoneDisplay(zoneNumber) {
        const zoneElement = document.getElementById('zone');
        if (zoneElement) {
            zoneElement.textContent = zoneNumber;
        }
    }

    async transitionToZone(newZone) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const zoneInfo = this.getZoneInfo(newZone);
        this.showZoneAnnouncement(zoneInfo.name);

        const newBackgroundElement = document.createElement('div');
        newBackgroundElement.className = `background-image zone-${newZone}`;
        newBackgroundElement.style.opacity = '0';

        await this.preloadBackground(zoneInfo.background);

        // The new image sits on top of the old one and fades in over it;
        // the old image stays fully visible underneath until removed, so
        // the fallback gradient never shows through mid-fade.
        this.backgroundContainer.appendChild(newBackgroundElement);

        // Force a reflow so the opacity transition triggers
        newBackgroundElement.offsetHeight;

        setTimeout(() => {
            newBackgroundElement.style.opacity = '1';
        }, 100);

        setTimeout(() => {
            if (this.currentBackgroundElement) {
                this.currentBackgroundElement.remove();
            }
            this.currentBackgroundElement = newBackgroundElement;
            this.isTransitioning = false;
        }, 2000);

        this.currentZone = newZone;
    }

    preloadBackground(filename) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = () => {
                console.error(`Background failed to load: Backgrounds/${filename}`);
                resolve();
            };
            img.src = `Backgrounds/${filename}`;
        });
    }

    showZoneAnnouncement(zoneName) {
        document.querySelector('.zone-indicator')?.remove();

        const announcement = document.createElement('div');
        announcement.className = 'zone-indicator';
        announcement.textContent = zoneName;
        document.body.appendChild(announcement);

        setTimeout(() => announcement.remove(), 3000);
    }

    // Jump straight to a zone with no transition (used when loading a save)
    setZone(zoneNumber) {
        this.currentZone = zoneNumber;
        if (this.currentBackgroundElement) {
            this.currentBackgroundElement.className = `background-image zone-${zoneNumber}`;
        }
        this.updateZoneDisplay(zoneNumber);
    }
}
