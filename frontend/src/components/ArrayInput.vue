<template>
    <div>
        <!-- KEY: value maps (e.g. environment) are edited as a map, so the YAML keeps its format -->
        <div v-if="isMap">
            <ul v-if="mapEntries.length > 0" class="list-group">
                <li v-for="([ key, value ], index) in mapEntries" :key="key" class="list-group-item">
                    <input :value="key" type="text" class="no-bg domain-input map-key" placeholder="KEY" spellcheck="false" @change="renameKey(index, $event)" />
                    <span class="map-separator">=</span>
                    <input :value="value ?? ''" type="text" class="no-bg domain-input" placeholder="value" spellcheck="false" @input="array[key] = $event.target.value" />
                    <font-awesome-icon icon="times" class="action remove ms-2 me-3 text-danger" @click="removeKey(key)" />
                </li>
            </ul>
            <button class="btn btn-normal btn-sm mt-2" @click="addKey">{{ $t("addListItem", [ displayName ]) }}</button>
        </div>
        <div v-else-if="valid">
            <ul v-if="isArrayInited && array.length > 0" class="list-group">
                <li v-for="(value, index) in array" :key="index" class="list-group-item">
                    <input v-model="array[index]" type="text" class="no-bg domain-input" :placeholder="placeholder" spellcheck="false" />
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
        objectType: {
            type: String,
            default: "service",
        },
        // Also accept a KEY: value map, like `environment`
        allowMap: {
            type: Boolean,
            default: false,
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

        /**
         * Not a good name, but it is used to get the object.
         */
        service() {
            if (this.objectType === "service") {
                // Used in Container.vue
                return this.$parent.$parent.service;
            } else if (this.objectType === "x-dockge") {

                if (!this.$parent.$parent.jsonConfig["x-dockge"]) {
                    return {};
                }

                // Used in Compose.vue
                return this.$parent.$parent.jsonConfig["x-dockge"];
            } else {
                return {};
            }
        },

        isMap() {
            const value = this.service[this.name];
            return this.allowMap && !!value && typeof value === "object" && !Array.isArray(value) &&
                Object.values(value).every(v => v === null || [ "string", "number", "boolean" ].includes(typeof v));
        },

        mapEntries() {
            return Object.entries(this.array);
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

            // Create the object if not exists.
            if (this.objectType === "x-dockge") {
                if (!this.$parent.$parent.jsonConfig["x-dockge"]) {
                    this.$parent.$parent.jsonConfig["x-dockge"] = {};
                }
            }

            // Create the array if not exists.
            if (!this.service[this.name]) {
                this.service[this.name] = [];
            }

            this.array.push("");
        },
        remove(index) {
            this.array.splice(index, 1);
        },
        addKey() {
            let key = "NEW_VARIABLE";
            for (let i = 2; key in this.array; i++) {
                key = `NEW_VARIABLE_${i}`;
            }
            this.array[key] = "";
        },
        renameKey(index, event) {
            const entries = Object.entries(this.array);
            const newKey = event.target.value.trim();
            if (!newKey || (newKey !== entries[index][0] && newKey in this.array)) {
                // Empty or duplicate name: put the old name back
                event.target.value = entries[index][0];
                return;
            }
            entries[index][0] = newKey;
            // Rebuild the object so the key keeps its position
            this.service[this.name] = Object.fromEntries(entries);
        },
        removeKey(key) {
            delete this.array[key];
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

.map-key {
    flex: 0 1 40% !important;
    font-family: "JetBrains Mono", monospace;
}

.map-separator {
    color: #8b9098;
}
</style>
