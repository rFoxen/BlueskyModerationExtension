import Logger from '@src/utils/logger/Logger';

class Background {
    constructor() {
        this.initialize();
    }

    private initialize(): void {
        Logger.debug('Background script initialized.');
        // Add background functionalities here if needed
    }
}

new Background();
