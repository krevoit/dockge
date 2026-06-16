<template>
    <div class="mobile-stack-list">
        <router-link to="/compose" class="btn btn-primary mb-3">
            <font-awesome-icon icon="plus" /> {{ $t("compose") }}
        </router-link>
        <StackList :scrollbar="false" />
    </div>
</template>

<script>
import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },

    watch: {
        "$root.isMobile": {
            handler() {
                if (!this.$root.isMobile) {
                    this.$router.replace("/");
                }
            },
        },
    },
};
</script>

<style lang="scss" scoped>
.mobile-stack-list {
    padding: 0 12px 18px;
}
</style>
