/*Reader → ReaderManager → TagProcessor
                                 ↓
                            EventBus
                                 ↓
                 RfidSdk / Electron / UI*/

import { RfidEventEmitter } from "../events/EventBus";

export class TagProcessor {
    private totalCount = 0;
    private uniqueTags = new Set<string>();

    constructor(
        private emitter: RfidEventEmitter,
        private database: any // Placeholder for database connection
    ) {}

    handleTag(payload: any) {
        this.totalCount++;
        this.uniqueTags.add(payload.tagId);

        this.database.insertTag(payload); // Simulated DB insert

        this.emitter.emit(payload); // Emit to EventBus
    }

    getStats() {
        return {
            totalCount: this.totalCount,
            uniqueCount: this.uniqueTags.size
        };
    }

    resetStats() {
        this.totalCount = 0;
        this.uniqueTags.clear();
    }
}