export class Latch {
    private isDone = false
    private resolve: () => void = () => {}

    done() {
        this.isDone = true
        this.resolve()
    }

    await(): Promise<void> {
        if (this.isDone) {
            return Promise.resolve()
        }
        return new Promise<void>((resolve, _) => { this.resolve = resolve })
    }
}