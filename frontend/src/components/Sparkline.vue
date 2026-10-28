<template>
    <svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <path v-if="paths" class="sparkline-area" :d="paths.area" />
        <path v-if="paths" class="sparkline-line" :d="paths.line" vector-effect="non-scaling-stroke" />
    </svg>
</template>

<script>
const HEIGHT = 28;

export default {
    props: {
        // Newest value last
        values: {
            type: Array,
            default: () => [],
        },
        // Number of samples the full width represents; the line grows in from the right
        capacity: {
            type: Number,
            default: 60,
        },
        // Lowest top of the scale, so near-idle noise doesn't fill the whole height
        minScale: {
            type: Number,
            default: 0,
        },
    },

    computed: {
        paths() {
            const values = this.values.slice(-this.capacity);
            if (values.length < 2) {
                return null;
            }
            const max = Math.max(this.minScale, ...values) * 1.15 || 1;
            const step = 100 / (this.capacity - 1);
            const points = values.map((v, i) => {
                const x = 100 - (values.length - 1 - i) * step;
                const y = HEIGHT - 1 - (Math.max(0, v) / max) * (HEIGHT - 3);
                return [ x.toFixed(2), y.toFixed(2) ];
            });
            const line = "M" + points.map(p => p.join(" ")).join(" L");
            const area = `${line} L${points[points.length - 1][0]} ${HEIGHT} L${points[0][0]} ${HEIGHT} Z`;
            return {
                line,
                area,
            };
        },
    },
};
</script>

<style scoped lang="scss">
.sparkline {
    display: block;
    height: var(--spark-height, 28px);
    overflow: visible;
    width: 100%;
}

.sparkline-line {
    fill: none;
    stroke: currentColor;
    stroke-linejoin: round;
    stroke-width: 1.5;
}

.sparkline-area {
    fill: currentColor;
    opacity: 0.14;
}
</style>
