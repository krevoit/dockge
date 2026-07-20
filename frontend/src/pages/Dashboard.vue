<template>
    <div class="container-fluid dashboard-shell">
        <div class="row g-0">
            <aside v-if="!$root.isMobile" class="stack-browser">
                <div class="stack-browser-title">
                    <div><strong>{{ $t("Stacks") }}</strong><span>{{ Object.keys($root.completeStackList).length }}</span></div>
                    <router-link to="/compose" class="btn btn-primary"><font-awesome-icon icon="plus" /> {{ $t("compose") }}</router-link>
                </div>
                <StackList :scrollbar="true" />
            </aside>

            <div ref="container" class="dashboard-workbench">
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </div>
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0
        };
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
.container-fluid {
    width: 100%;
}

.dashboard-shell {
    background: #0c0d0f;
    min-height: calc(100vh - 62px);
    padding: 10px;

    > .row {
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(370px, 28%) minmax(0, 1fr);
    }
}

.stack-browser {
    background: #15171b;
    border: 1px solid #2b2f36;
    border-radius: 8px;
    height: calc(100vh - 82px);
    overflow: hidden;
    padding: 13px 12px 0;
    position: sticky;
    top: 72px;
    width: auto;
}

.stack-browser-title {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin: 0 2px 12px;

    div { align-items: baseline; display: flex; gap: 9px; }
    strong { font-size: 18px; font-weight: 600; letter-spacing: -0.015em; }
    span { color: #858b93; font-size: 12px; }
}

.dashboard-workbench {
    min-width: 0;
    padding: 0;
    width: auto;
}

.dark {
    .stack-browser {
        background: #15171b;
        border-color: #2b2f36;
    }

    .dashboard-workbench {
        background: transparent;
    }

    .stack-browser-title span { color: #737982; }
}

@media (max-width: 1199px) {
    .dashboard-shell > .row { grid-template-columns: minmax(330px, 34%) minmax(0, 1fr); }
}

@media (max-width: 767px) {
    .dashboard-shell { padding: 10px; }
    .dashboard-shell > .row { display: block; }
}
</style>
