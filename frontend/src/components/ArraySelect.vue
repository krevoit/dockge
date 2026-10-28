<template>
    <div>
        <div v-if="valid">
            <ul v-if="isArrayInited && array.length > 0" class="list-group">
                <li v-for="(value, index) in array" :key="index" class="list-group-item">
                    <select v-model="array[index]" class="no-bg domain-input">
                        <option value="">{{ $t(`Select a network...`) }}</option>
                        <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
                    </select>

                    <font-awesome-icon icon="times" class="action remove ms-2 me-3 text-danger" @click="remove(index)" />
                </li>
            </ul>

            <button class="btn btn-normal btn-sm mt-2" @click="addField">{{ $t("addListItem", [ displayName ]) }}</button>
        </div>
        <div v-else class="form-text">
            <font-awesome-icon icon="info-circle" class="me-1" />
            {{ $t("LongSyntaxNotSupported") }}
        </div>
    </div>
</template>

<script>
export default {
    props: {
        name: {
            type: String,
            required: true,
        },
        placeholder: {
            type: String,
            default: "",
        },
        displayName: {
            type: String,
            required: true,
        },
        options: {
            type: Array,
            required: true,
        },
    },
    data() {
        return {

        };
    },
    computed: {
        array() {
            // Create the array if not exists, it should be safe.
            if (!this.service[this.name]) {
                return [];
            }
            return this.service[this.name];
        },

        /**
         * Check if the array is inited before called v-for.
         * Prevent empty arrays inserted to the YAML file.
         * @return {boolean}
         */
        isArrayInited() {
            return this.service[this.name] !== undefined;
        },

        service() {
            return this.$parent.$parent.service;
        },

        valid() {
            // Check if the array is actually an array
            if (!Array.isArray(this.array)) {
                return false;
            }

            // Check if the array contains non-object only.
            for (let item of this.array) {
                if (typeof item === "object") {
                    return false;
                }
            }
            return true;
        }

    },
    created() {

    },
    methods: {
        addField() {
            // Create the array if not exists.
            if (!this.service[this.name]) {
                this.service[this.name] = [];
            }
            this.array.push("");
        },
        remove(index) {
            this.array.splice(index, 1);
        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.list-group {
    li {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 0 8px 10px;

        .domain-input {
            flex-grow: 1;
            min-width: 0;
            background-color: transparent;
            border: none;
            color: inherit;
            font-size: 13px;
            outline: none;

            &::placeholder {
                color: #8b9098;
            }
        }
    }
}

.dark .list-group {
    background-color: $dark-bg2;

    li .domain-input::placeholder {
        color: #626871;
    }

    option {
        background-color: $dark-bg2;
    }
}
</style>
