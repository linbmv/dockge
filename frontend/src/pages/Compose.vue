<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 v-if="isAdd" class="mb-3">{{ $t("compose") }}</h1>
            <h1 v-else class="mb-3">
                <Uptime :stack="globalStack" :pill="true" /> {{ stack.name }}
                <span v-if="$root.agentCount > 1 && endpoint !== ''" class="agent-name">
                    ({{ endpointDisplay }})
                </span>
            </h1>

            <div v-if="stack.isManagedByDockge" class="compose-toolbar mb-3">
                <div class="btn-group me-2" role="group">
                    <button
                        v-if="isEditMode && !isAdd"
                        class="btn btn-normal"
                        :class="{ 'has-changes': hasUnsavedChanges }"
                        :disabled="processing"
                        :title="hasUnsavedChanges ? $t('confirmDiscardStack') : $t('cancelEdit')"
                        @click="discardStack"
                    >
                        <font-awesome-icon icon="undo" class="me-1" />
                        {{ $t("discardStack") }}<span v-if="hasUnsavedChanges" class="unsaved-mark">*</span>
                    </button>

                    <button v-if="isEditMode && isAdd" class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ isAdd ? $t("createAndDeployStack") : $t("deployStack") }}
                    </button>

                    <button v-if="isEditMode" class="btn btn-normal" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ isAdd ? $t("saveStackDraftOnly") : $t("saveStackDraft") }}
                    </button>

                    <button
                        v-if="!isEditMode"
                        class="btn btn-secondary"
                        :disabled="processing || !canEditStack"
                        :title="canEditStack ? $t('editStack') : 'Stop the stack before editing files'"
                        @click="enableEditMode"
                    >
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("editStack") }}
                    </button>

                    <router-link
                        v-if="!isEditMode && primaryServiceActive && serviceNames.length === 1"
                        class="btn btn-normal"
                        :to="bashRouteLink"
                    >
                        <font-awesome-icon icon="terminal" class="me-1" />
                        Bash
                    </router-link>

                    <button
                        v-if="!isEditMode"
                        class="btn btn-normal"
                        :class="{ 'is-active': showTerminal }"
                        :disabled="processing"
                        @click="showTerminal = !showTerminal"
                    >
                        <font-awesome-icon icon="terminal" class="me-1" />
                        {{ $t("terminal") }}
                    </button>

                    <button v-if="!isEditMode && !active" class="btn btn-primary" :disabled="processing" @click="startStack">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal " :disabled="processing" @click="restartStack">
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal" :disabled="processing" @click="updateStack">
                        <font-awesome-icon icon="cloud-arrow-down" class="me-1" />
                        {{ $t("updateStack") }}
                    </button>

                    <button v-if="!isEditMode && stack.isGitRepository" class="btn btn-normal" :disabled="processing" @click="gitPullAndBuildStack">
                        <font-awesome-icon icon="wrench" class="me-1" />
                        {{ $t("gitPullAndBuildStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal" :disabled="processing" @click="stopStack">
                        <font-awesome-icon icon="pause" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>

                    <BDropdown right text="" variant="normal">
                        <BDropdownItem @click="downStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("downStack") }}
                        </BDropdownItem>
                    </BDropdown>

                    <button v-if="isEditMode && !isAdd" class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>
                </div>

                <button v-if="!isEditMode" class="btn btn-danger" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                    <font-awesome-icon icon="trash" class="me-1" />
                    {{ $t("deleteStack") }}
                </button>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url">
                    <span class="badge bg-secondary me-2">{{ urlItem.display }}</span>
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div v-if="stack.isManagedByDockge" class="row">
                <div class="col-lg-6">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div>
                                <label class="form-label">{{ $t("deploymentSource") }}</label>
                                <div class="source-selector" role="group" :aria-label="$t('deploymentSource')">
                                    <button
                                        type="button"
                                        class="btn"
                                        :class="creationSource === 'compose' ? 'btn-primary' : 'btn-normal'"
                                        :aria-pressed="creationSource === 'compose'"
                                        @click="selectCreationSource('compose')"
                                    >
                                        <font-awesome-icon icon="file" class="me-1" />
                                        {{ $t("sourceComposeOrImage") }}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn"
                                        :class="creationSource === 'local' ? 'btn-primary' : 'btn-normal'"
                                        :aria-pressed="creationSource === 'local'"
                                        @click="selectCreationSource('local')"
                                    >
                                        <font-awesome-icon icon="wrench" class="me-1" />
                                        {{ $t("sourceLocalBuild") }}
                                    </button>
                                </div>
                                <div class="form-text">
                                    {{ $t(creationSource === "local" ? "sourceLocalBuildHelp" : "sourceComposeOrImageHelp") }}
                                </div>
                            </div>

                            <!-- Stack Name -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select" @change="changeEndpoint">
                                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint" :disabled="$root.agentStatusList[agentEndpoint] != 'online'">
                                        ({{ $root.agentStatusList[agentEndpoint] }}) {{ (agent.name !== '') ? agent.name : agent.url || $t("Current") }}
                                    </option>
                                </select>
                            </div>

                            <div v-if="creationSource === 'local' || relativeBuildContexts.length > 0" class="mt-3">
                                <label class="form-label">{{ $t("localProjectSource") }}</label>
                                <div class="source-selector project-source-selector" role="group" :aria-label="$t('localProjectSource')">
                                    <button
                                        type="button"
                                        class="btn"
                                        :class="localProjectSource === 'server' ? 'btn-primary' : 'btn-normal'"
                                        :aria-pressed="localProjectSource === 'server'"
                                        :disabled="!stackDefaults.projectsDir"
                                        @click="selectLocalProjectSource('server')"
                                    >
                                        <font-awesome-icon icon="warehouse" class="me-1" />
                                        {{ $t("serverProjectPath") }}
                                    </button>
                                    <button
                                        type="button"
                                        class="btn"
                                        :class="localProjectSource === 'upload' ? 'btn-primary' : 'btn-normal'"
                                        :aria-pressed="localProjectSource === 'upload'"
                                        @click="selectLocalProjectSource('upload')"
                                    >
                                        <font-awesome-icon icon="upload" class="me-1" />
                                        {{ $t("uploadProjectFolder") }}
                                    </button>
                                </div>

                                <div v-if="localProjectSource === 'server'" class="mt-3">
                                    <label for="server-project-path" class="form-label">{{ $t("serverProjectPath") }}</label>
                                    <div class="input-group project-path-input">
                                        <input
                                            id="server-project-path"
                                            v-model="serverProjectPath"
                                            type="text"
                                            class="form-control"
                                            :placeholder="stackDefaults.projectsDir ? stackDefaults.projectsDir + '/my-project' : '/root/data/docker/my-project'"
                                            @input="serverProjectReady = false"
                                            @keyup.enter="inspectServerProject"
                                        >
                                        <button
                                            type="button"
                                            class="btn btn-primary"
                                            :disabled="serverProjectLoading || !serverProjectPath.trim()"
                                            @click="inspectServerProject"
                                        >
                                            <span v-if="serverProjectLoading" class="spinner-border spinner-border-sm me-1"></span>
                                            <font-awesome-icon v-else icon="search" class="me-1" />
                                            {{ $t("loadServerProject") }}
                                        </button>
                                    </div>
                                    <div class="form-text">
                                        {{ stackDefaults.projectsDir
                                            ? $t("serverProjectPathHelp", [ stackDefaults.projectsDir ])
                                            : $t("serverProjectImportDisabled") }}
                                    </div>
                                    <div v-if="serverProjectReady" class="form-text text-success">
                                        {{ $t("serverProjectLoaded", [ projectComposeFileName ]) }}
                                    </div>
                                </div>

                                <div v-else class="mt-3">
                                    <label for="stack-project-folder" class="form-label">{{ $t("localProjectFolder") }}</label>
                                    <input
                                        id="stack-project-folder"
                                        ref="stackProjectFolder"
                                        type="file"
                                        class="form-control"
                                        webkitdirectory
                                        multiple
                                        @change="selectBuildContext"
                                    >
                                    <div class="form-text">
                                        {{ creationSource === "local"
                                            ? $t("localProjectFolderImportHelp")
                                            : $t("localProjectFolderHelp", [ relativeBuildContexts.join(", ") ]) }}
                                    </div>
                                    <div v-if="buildContextFiles.length > 0" class="form-text build-context-status">
                                        <span>
                                            {{ $t("localProjectFolderSelected", [ buildContextFiles.length, formatFileSize(buildContextTotalBytes) ]) }}
                                            <template v-if="projectComposeFileName">
                                                · {{ projectComposeFileName }}
                                            </template>
                                        </span>
                                        <progress v-if="uploadProgress > 0" :value="uploadProgress" max="100"></progress>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <h4 class="mb-3">{{ $tc("container", 2) }}</h4>

                    <div v-if="isEditMode && !isAdd" class="input-group mb-3">
                        <input
                            v-model="newContainerName"
                            :placeholder="$t(`New Container Name...`)"
                            class="form-control"
                            @keyup.enter="addContainer"
                        />
                        <button class="btn btn-primary" @click="addContainer">
                            {{ $t("addContainer") }}
                        </button>
                    </div>

                    <div v-if="isAdd && serviceNames.length === 0" class="shadow-box big-padding mb-3 form-text">
                        {{ $t("noServicesYet") }}
                    </div>

                    <div ref="containerList">
                        <Container
                            v-for="(service, name) in jsonConfig.services"
                            :key="name"
                            :name="name"
                            :is-edit-mode="isEditMode && !isAdd"
                            :first="name === Object.keys(jsonConfig.services)[0]"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                        />
                    </div>

                    <button v-if="false && isEditMode && jsonConfig.services && Object.keys(jsonConfig.services).length > 0" class="btn btn-normal mb-3" @click="addContainer">{{ $t("addContainer") }}</button>

                    <!-- General -->
                    <div v-if="isEditMode && !isAdd">
                        <h4 class="mb-3">{{ $t("extra") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-if="showTerminal && !isEditMode">
                        <h4 class="mb-3">{{ $t("terminal") }}</h4>
                        <Terminal
                            ref="combinedTerminal"
                            class="mb-3 terminal"
                            :name="combinedTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            style="height: 315px;"
                        ></Terminal>
                    </div>
                </div>
                <div v-if="isEditMode" class="col-lg-6">
                    <h4 class="mb-3">{{ stack.composeFileName }}</h4>

                    <!-- YAML editor -->
                    <div class="shadow-box mb-3 editor-box edit-mode">
                        <code-mirror
                            ref="editor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            :placeholder="$t('composeEditorPlaceholder')"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />
                    </div>
                    <div v-if="yamlError" class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- ENV editor -->
                    <div>
                        <h4 class="mb-3">.env</h4>
                        <div class="shadow-box mb-3 editor-box edit-mode">
                            <code-mirror
                                ref="editor"
                                v-model="stack.composeENV"
                                :extensions="extensionsEnv"
                                :placeholder="$t('envEditorPlaceholder')"
                                minimal
                                wrap="true"
                                dark="true"
                                tab="true"
                                :disabled="!isEditMode"
                                :hasFocus="editorFocus"
                                @change="yamlCodeChange"
                            />
                        </div>
                    </div>

                    <!-- Network / port presets (shown only in add mode) -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("networkAndPortPresets") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div class="form-text mb-3">{{ $t("networkAndPortPresetsHelp") }}</div>

                            <div v-if="stackDefaults.defaultExternalNetwork" class="mb-3">
                                <button
                                    class="btn btn-normal me-2"
                                    :disabled="pendingNetworkServices.length === 0"
                                    @click="applyNetworkPreset"
                                >
                                    {{ $t("joinSharedNetwork", [ stackDefaults.defaultExternalNetwork ]) }}
                                </button>
                                <span v-if="pendingNetworkServices.length > 0" class="form-text">
                                    {{ $t("joinSharedNetworkPending", [ pendingNetworkServices.join(", ") ]) }}
                                </span>
                                <span v-else class="form-text">{{ $t("joinSharedNetworkDone") }}</span>
                            </div>

                            <div>
                                <button
                                    class="btn btn-normal me-2"
                                    :disabled="allocatingPorts || portPreset.rewritable.length === 0 || !stackDefaults.publishedHostIPValue"
                                    @click="applyPortPreset"
                                >
                                    <span v-if="allocatingPorts" class="spinner-border spinner-border-sm me-1"></span>
                                    {{ $t("pinPortsToTailnet") }}
                                </button>

                                <div v-if="!stackDefaults.publishedHostIPValue" class="form-text text-warning mt-2">
                                    {{ $t("publishedHostIPMissing", [ stackDefaults.publishedHostIPVariable ]) }}
                                </div>
                                <ul v-else-if="portPreset.rewritable.length > 0" class="preset-list mt-2">
                                    <li v-for="entry in portPreset.rewritable" :key="entry.serviceName + ':' + entry.index">
                                        <code>{{ entry.serviceName }}</code> — {{ entry.original }}
                                    </li>
                                </ul>
                                <div v-else-if="serviceNames.length === 0" class="form-text mt-2">
                                    {{ $t("pinPortsToTailnetEmpty") }}
                                </div>
                                <div v-else class="form-text mt-2">{{ $t("pinPortsToTailnetDone") }}</div>

                                <ul v-if="portPreset.skipped.length > 0" class="preset-list mt-2 text-warning">
                                    <li v-for="entry in portPreset.skipped" :key="'skip-' + entry.serviceName + ':' + entry.index">
                                        <code>{{ entry.serviceName }}</code> — {{ entry.original }}
                                        <span class="ms-1">({{ $t("portPresetSkip_" + entry.skipReason) }})</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div v-if="isEditMode && !isAdd">
                        <!-- Volumes -->
                        <div v-if="false">
                            <h4 class="mb-3">{{ $tc("volume", 2) }}</h4>
                            <div class="shadow-box big-padding mb-3">
                            </div>
                        </div>

                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <NetworkInput />
                        </div>
                    </div>

                    <!-- <div class="shadow-box big-padding mb-3">
                        <div class="mb-3">
                            <label for="name" class="form-label"> Search Templates</label>
                            <input id="name" v-model="name" type="text" class="form-control" placeholder="Search..." required>
                        </div>

                        <prism-editor v-if="false" v-model="yamlConfig" class="yaml-editor" :highlight="highlighter" line-numbers @input="yamlCodeChange"></prism-editor>
                    </div>-->
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <BModal
                v-model="showBindMountSetupDialog"
                :title="$t('bindMountSetupTitle')"
                size="lg"
                hide-footer
                no-close-on-backdrop
                :no-close-on-esc="bindMountSetupProcessing"
                @hidden="clearBindMountSetup"
            >
                <p class="mb-3">
                    {{ $t("bindMountSetupIntro") }}
                </p>

                <div
                    v-for="mount in bindMountSetupItems"
                    :key="mount.source"
                    class="bind-mount-setup-item"
                >
                    <div class="bind-mount-source-label">{{ $t("bindMountSource") }}</div>
                    <code class="bind-mount-source">{{ mount.displaySource }}</code>
                    <div class="bind-mount-uses">
                        <span v-for="use in mount.uses" :key="`${use.service}:${use.target}`">
                            {{ use.service }} &rarr; <code>{{ use.target }}</code>
                        </span>
                    </div>

                    <div v-if="!mount.canCreate" class="alert alert-warning mt-3 mb-0">
                        {{ $t("bindMountOutsideStack") }}
                    </div>

                    <template v-else>
                        <div class="btn-group bind-mount-type-selector mt-3" role="group" :aria-label="$t('bindMountSourceType')">
                            <button
                                type="button"
                                class="btn"
                                :class="mount.type === 'file' ? 'btn-primary' : 'btn-normal'"
                                :aria-pressed="mount.type === 'file'"
                                :disabled="bindMountSetupProcessing"
                                @click="mount.type = 'file'"
                            >
                                <font-awesome-icon icon="file" class="me-1" />
                                {{ $t("bindMountCreateFile") }}
                            </button>
                            <button
                                type="button"
                                class="btn"
                                :class="mount.type === 'directory' ? 'btn-primary' : 'btn-normal'"
                                :aria-pressed="mount.type === 'directory'"
                                :disabled="bindMountSetupProcessing"
                                @click="mount.type = 'directory'"
                            >
                                <font-awesome-icon icon="folder" class="me-1" />
                                {{ $t("bindMountCreateDirectory") }}
                            </button>
                        </div>

                        <div v-if="mount.type === 'file'" class="mt-3">
                            <label :for="`bind-mount-content-${mount.id}`" class="form-label">
                                {{ $t("bindMountInitialContent") }}
                            </label>
                            <textarea
                                :id="`bind-mount-content-${mount.id}`"
                                v-model="mount.content"
                                class="form-control bind-mount-content"
                                rows="4"
                                :placeholder="$t('bindMountInitialContentPlaceholder')"
                                :disabled="bindMountSetupProcessing"
                            ></textarea>
                        </div>
                    </template>
                </div>

                <div class="modal-footer bind-mount-dialog-actions px-0 pb-0">
                    <button type="button" class="btn btn-normal" :disabled="bindMountSetupProcessing" @click="showBindMountSetupDialog = false">
                        {{ $t("cancel") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="!canPrepareBindMounts || bindMountSetupProcessing"
                        @click="prepareBindMountsAndRetry"
                    >
                        <font-awesome-icon v-if="bindMountSetupProcessing" icon="spinner" spin class="me-1" />
                        <font-awesome-icon v-else icon="play" class="me-1" />
                        {{ $t("bindMountPrepareAndRetry") }}
                    </button>
                </div>
            </BModal>

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                {{ $t("deleteStackMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { parseDocument, Document } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import dotenv from "dotenv";
import { ref } from "vue";
import { resolveRequiredEnvironmentVariable } from "../../../common/published-port";
import {
    applyDefaultExternalNetworkToDoc,
    applyPortRewritesToDoc,
    getRelativeBuildContexts,
    planDefaultExternalNetwork,
    planPortPreset
} from "../../../common/compose-preset";
import { applyInternalIPAllocations } from "../../../common/internal-ip";
import {
    findProjectComposeFile,
    removeDirectoryUploadRoot,
    STACK_UPLOAD_CHUNK_MAX_BYTES,
    STACK_UPLOAD_MAX_BYTES,
    STACK_UPLOAD_MAX_FILES,
    stackNameFromProjectRoot
} from "../../../common/stack-file-upload";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;

export default {
    components: {
        NetworkInput,
        FontAwesomeIcon,
        CodeMirror,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            yaml(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        const extensionsEnv = [
            editorTheme,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions,
            extensionsEnv,
            editorFocus };
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            showTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {

            },
            stackDefaults: {
                defaultExternalNetwork: "",
                publishedHostIPVariable: "TS_HOST_IP",
                publishedHostIPValue: "",
                publishedPortStart: 20000,
                publishedPortEnd: 39999,
                internalIPNetwork: "",
                internalIPSubnet: "",
                internalIPPrefix: "",
                projectsDir: "",
            },
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            savedStackSnapshot: null,
            submitted: false,
            showDeleteDialog: false,
            showBindMountSetupDialog: false,
            bindMountSetupProcessing: false,
            bindMountSetupItems: [],
            pendingBindMountRetry: null,
            newContainerName: "",
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
            allocatingPorts: false,
            creationSource: "compose",
            localProjectSource: "server",
            serverProjectPath: "",
            serverProjectLoadedPath: "",
            serverProjectLoading: false,
            serverProjectReady: false,
            buildContextFiles: [],
            buildContextTotalBytes: 0,
            projectComposeFileName: "",
            uploadProgress: 0,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        serviceNames() {
            if (!this.jsonConfig.services || typeof this.jsonConfig.services !== "object") {
                return [];
            }
            return Object.keys(this.jsonConfig.services);
        },

        relativeBuildContexts() {
            return getRelativeBuildContexts(this.jsonConfig);
        },

        localProjectReady() {
            if (this.localProjectSource === "server") {
                return this.serverProjectReady;
            }
            return this.buildContextFiles.length > 0;
        },

        /**
         * Which `ports:` entries the Tailnet preset can pin, and which it will
         * leave alone. Recomputed from the editor content, so it always
         * describes what is actually in the YAML right now.
         */
        portPreset() {
            return planPortPreset(this.jsonConfig, this.stackDefaults.publishedHostIPVariable);
        },

        pendingNetworkServices() {
            return planDefaultExternalNetwork(this.jsonConfig, this.stackDefaults.defaultExternalNetwork);
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.stackHasRunningService || [ "running", "healthy", "unhealthy" ].includes(this.status);
        },

        hasUnsavedChanges() {
            if (!this.savedStackSnapshot) {
                return false;
            }
            return (this.stack.composeYAML || "") !== this.savedStackSnapshot.composeYAML
                || (this.stack.composeENV || "") !== this.savedStackSnapshot.composeENV;
        },

        stackHasRunningService() {
            return this.serviceNames.some(name => this.serviceStatusList[name]?.some(service => (
                service && [ "running", "healthy", "unhealthy" ].includes(service.status)
            )));
        },

        primaryServiceActive() {
            const serviceName = this.serviceNames[0];
            return Boolean(serviceName && this.serviceStatusList[serviceName]?.some(service => (
                service && [ "running", "healthy", "unhealthy" ].includes(service.status)
            )));
        },

        canEditStack() {
            if (this.isAdd) {
                return true;
            }
            if (this.stackHasRunningService) {
                return false;
            }
            if (!this.status) {
                return false;
            }
            return ![ "running", "healthy", "unhealthy", "starting", "restarting", "paused" ].includes(this.status);
        },

        bashRouteLink() {
            const serviceName = this.serviceNames[0];
            if (!serviceName) {
                return { name: "containerTerminal" };
            }
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stack.name,
                        serviceName,
                        type: "bash",
                    },
                };
            }
            return {
                name: "containerTerminal",
                params: {
                    stackName: this.stack.name,
                    serviceName,
                    type: "bash",
                },
            };
        },

        canPrepareBindMounts() {
            return this.bindMountSetupItems.length > 0 && this.bindMountSetupItems.every(mount => (
                mount.canCreate && (mount.type === "file" || mount.type === "directory")
            ));
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    async mounted() {
        window.addEventListener("keydown", this.handleEscapeKey, true);
        this.stackDefaults = await this.getStackDefaults();

        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = "";
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = "";
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
                composeFileName: "compose.yaml",
            };

            this.localProjectSource = this.stackDefaults.projectsDir ? "server" : "upload";

            if (composeYAML) {
                this.yamlCodeChange();
            }

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    unmounted() {
        window.removeEventListener("keydown", this.handleEscapeKey, true);
    },
    methods: {
        handleEscapeKey(event) {
            if (event.key !== "Escape" || this.showDeleteDialog || this.showBindMountSetupDialog) {
                return;
            }
            event.preventDefault();
            this.$router.push("/");
        },

        selectCreationSource(source) {
            this.creationSource = source;
            if (source === "compose") {
                this.clearBuildContext();
                this.clearServerProject();
            } else {
                this.localProjectSource = this.stackDefaults.projectsDir ? "server" : "upload";
            }
        },

        selectLocalProjectSource(source) {
            if (source === "server" && !this.stackDefaults.projectsDir) {
                this.$root.toastError(this.$t("serverProjectImportDisabled"));
                return;
            }
            this.localProjectSource = source;
            if (source === "server") {
                this.clearBuildContext();
            } else {
                this.clearServerProject();
            }
        },

        async changeEndpoint() {
            this.clearBuildContext();
            this.clearServerProject();
            this.stackDefaults = await this.getStackDefaults();
            this.localProjectSource = this.stackDefaults.projectsDir ? "server" : "upload";
        },

        async inspectServerProject() {
            if (!this.serverProjectPath.trim()) {
                this.$root.toastError(this.$t("serverProjectPathRequired"));
                return;
            }

            this.serverProjectLoading = true;
            this.serverProjectReady = false;
            try {
                const res = await this.emitAgentRequest("inspectServerProject", this.serverProjectPath.trim());
                const project = res.project;
                this.yamlToJSON(project.composeYAML);

                this.clearBuildContext();
                this.serverProjectPath = project.projectPath;
                this.serverProjectLoadedPath = project.projectPath;
                this.serverProjectReady = true;
                this.projectComposeFileName = project.composeFileName;
                this.stack.composeFileName = project.composeFileName;
                this.stack.composeYAML = project.composeYAML;
                this.stack.composeENV = project.composeENV;
                if (!this.stack.name) {
                    this.stack.name = project.suggestedStackName;
                }
                this.yamlCodeChange();
            } catch (error) {
                this.handleStackSubmitError(error);
            } finally {
                this.serverProjectLoading = false;
                this.processing = false;
            }
        },

        clearServerProject() {
            this.serverProjectPath = "";
            this.serverProjectLoadedPath = "";
            this.serverProjectReady = false;
            this.serverProjectLoading = false;
            this.projectComposeFileName = "";
        },

        async selectBuildContext(event) {
            const selectedFiles = Array.from(event.target.files ?? []);
            const entries = selectedFiles.map(file => ({
                file,
                relativePath: removeDirectoryUploadRoot(file.webkitRelativePath || file.name),
            }));
            const rootNames = new Set(selectedFiles.map(file => (
                (file.webkitRelativePath || file.name).split("/")[0]
            )));
            const totalBytes = selectedFiles.reduce((total, file) => total + file.size, 0);

            if (rootNames.size !== 1 || entries.some(entry => entry.relativePath.length === 0)) {
                this.clearBuildContext();
                this.$root.toastError(this.$t("localProjectFolderInvalid"));
                return;
            }
            if (entries.length > STACK_UPLOAD_MAX_FILES) {
                this.clearBuildContext();
                this.$root.toastError(this.$t("localProjectFolderTooManyFiles", [ STACK_UPLOAD_MAX_FILES ]));
                return;
            }
            if (totalBytes > STACK_UPLOAD_MAX_BYTES) {
                this.clearBuildContext();
                this.$root.toastError(this.$t("localProjectFolderTooLarge"));
                return;
            }

            this.buildContextFiles = entries;
            this.buildContextTotalBytes = totalBytes;
            this.projectComposeFileName = "";
            this.uploadProgress = 0;

            const envEntry = entries.find(entry => entry.relativePath === ".env");
            if (this.creationSource === "local") {
                const composeFileName = findProjectComposeFile(entries.map(entry => entry.relativePath));
                const composeEntry = entries.find(entry => entry.relativePath === composeFileName);
                if (!composeEntry) {
                    this.clearBuildContext();
                    this.$root.toastError(this.$t("localProjectComposeMissing"));
                    return;
                }

                const composeYAML = await composeEntry.file.text();
                try {
                    this.yamlToJSON(composeYAML);
                } catch (error) {
                    this.clearBuildContext();
                    this.$root.toastError(this.$t("localProjectComposeInvalid", [ error.message || String(error) ]));
                    return;
                }

                this.stack.composeYAML = composeYAML;
                this.projectComposeFileName = composeFileName;
                if (!this.stack.name) {
                    this.stack.name = stackNameFromProjectRoot(Array.from(rootNames)[0]);
                }
                if (envEntry) {
                    this.stack.composeENV = await envEntry.file.text();
                }
                this.yamlCodeChange();
                return;
            }

            if (envEntry && !this.stack.composeENV) {
                this.stack.composeENV = await envEntry.file.text();
            }
        },

        clearBuildContext() {
            this.buildContextFiles = [];
            this.buildContextTotalBytes = 0;
            this.projectComposeFileName = "";
            this.uploadProgress = 0;
            if (this.$refs.stackProjectFolder) {
                this.$refs.stackProjectFolder.value = "";
            }
        },

        formatFileSize(bytes) {
            if (bytes < 1024) {
                return `${bytes} B`;
            }
            if (bytes < 1024 * 1024) {
                return `${(bytes / 1024).toFixed(1)} KiB`;
            }
            return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
        },

        emitAgentRequest(eventName, ...args) {
            return new Promise((resolve, reject) => {
                this.$root.emitAgent(this.stack.endpoint, eventName, ...args, (res) => {
                    if (res?.ok) {
                        resolve(res);
                    } else {
                        const error = new Error(res?.msg || "Project upload failed");
                        error.response = res;
                        reject(error);
                    }
                });
            });
        },

        async uploadBuildContext(deploy) {
            let uploadID;
            let uploadedBytes = 0;
            try {
                const beginResult = await this.emitAgentRequest("beginStackFileUpload", this.stack.name);
                uploadID = beginResult.uploadID;

                for (const entry of this.buildContextFiles) {
                    if (entry.file.size === 0) {
                        await this.emitAgentRequest("uploadStackFileChunk", uploadID, entry.relativePath, 0, new ArrayBuffer(0));
                        continue;
                    }

                    for (let offset = 0; offset < entry.file.size; offset += STACK_UPLOAD_CHUNK_MAX_BYTES) {
                        const chunk = await entry.file.slice(offset, offset + STACK_UPLOAD_CHUNK_MAX_BYTES).arrayBuffer();
                        await this.emitAgentRequest("uploadStackFileChunk", uploadID, entry.relativePath, offset, chunk);
                        uploadedBytes += chunk.byteLength;
                        this.uploadProgress = Math.round((uploadedBytes / this.buildContextTotalBytes) * 100);
                    }
                }

                return await this.emitAgentRequest(
                    "finishStackFileUpload",
                    uploadID,
                    this.stack.composeYAML,
                    this.stack.composeENV,
                    deploy
                );
            } catch (error) {
                if (uploadID) {
                    try {
                        await this.emitAgentRequest("cancelStackFileUpload", uploadID);
                    } catch (cancelError) {
                        // The backend removes the upload session before deployment starts.
                    }
                }
                throw error;
            }
        },

        importServerProject(deploy) {
            return this.emitAgentRequest(
                "importServerProject",
                this.stack.name,
                this.serverProjectLoadedPath,
                this.stack.composeYAML,
                this.stack.composeENV,
                deploy
            );
        },

        handleStackSubmitResponse(res) {
            this.processing = false;
            this.$root.toastRes(res);
            if (res.ok) {
                this.captureStackSnapshot();
                this.isEditMode = false;
                this.$router.push(this.url);
            }
        },

        handleStackSubmitError(error, retry = null) {
            if (retry && this.showBindMountSetup(error.response, retry)) {
                return;
            }

            this.processing = false;
            if (error.response) {
                this.$root.toastRes(error.response);
            } else {
                this.$root.toastError(error.message || String(error));
            }
        },

        showBindMountSetup(response, retry) {
            if (response?.type !== "missingBindMounts" || !Array.isArray(response.missingBindMounts)) {
                return false;
            }

            this.processing = false;
            this.bindMountSetupItems = response.missingBindMounts.map((mount, index) => ({
                ...mount,
                id: index,
                type: mount.suggestedType,
                content: "",
            }));
            this.pendingBindMountRetry = retry;
            this.showBindMountSetupDialog = true;
            return true;
        },

        clearBindMountSetup() {
            this.bindMountSetupItems = [];
            this.pendingBindMountRetry = null;
        },

        async prepareBindMountsAndRetry() {
            if (!this.canPrepareBindMounts || !this.pendingBindMountRetry) {
                return;
            }

            this.bindMountSetupProcessing = true;
            const retry = this.pendingBindMountRetry;
            const preparations = this.bindMountSetupItems.map(mount => ({
                source: mount.source,
                type: mount.type,
                content: mount.type === "file" ? mount.content : undefined,
            }));

            try {
                await this.emitAgentRequest("prepareStackBindMounts", this.stack.name, preparations);
                this.showBindMountSetupDialog = false;
                await retry();
            } catch (error) {
                this.handleStackSubmitError(error, retry);
            } finally {
                this.bindMountSetupProcessing = false;
            }
        },

        async deploySavedStack() {
            this.processing = true;
            try {
                const res = await this.emitAgentRequest(
                    "deployStack",
                    this.stack.name,
                    this.stack.composeYAML,
                    this.stack.composeENV,
                    false
                );
                this.handleStackSubmitResponse(res);
            } catch (error) {
                this.handleStackSubmitError(error, () => this.deploySavedStack());
            }
        },

        getStackDefaults() {
            return new Promise((resolve) => {
                this.$root.emitAgent(this.endpoint, "getStackDefaults", (res) => {
                    if (res?.ok && res.defaults) {
                        resolve(res.defaults);
                    } else {
                        if (res) {
                            this.$root.toastRes(res);
                        }
                        resolve({
                            defaultExternalNetwork: "",
                            publishedHostIPVariable: "TS_HOST_IP",
                            publishedHostIPValue: "",
                            publishedPortStart: 20000,
                            publishedPortEnd: 39999,
                            internalIPNetwork: "",
                            internalIPSubnet: "",
                            internalIPPrefix: "",
                            projectsDir: "",
                        });
                    }
                });
            });
        },

        ensureDefaultExternalNetworkForService(service) {
            const networkName = this.stackDefaults.defaultExternalNetwork;
            if (!networkName || service.network_mode) {
                return;
            }

            if (!this.jsonConfig.networks || Array.isArray(this.jsonConfig.networks)) {
                this.jsonConfig.networks = {};
            }
            if (!Object.hasOwn(this.jsonConfig.networks, networkName)) {
                this.jsonConfig.networks[networkName] = {
                    external: true,
                };
            }

            if (!service.networks) {
                service.networks = [ networkName ];
            } else if (Array.isArray(service.networks)) {
                if (!service.networks.includes(networkName)) {
                    service.networks.push(networkName);
                }
            } else if (typeof service.networks === "object" && !Object.hasOwn(service.networks, networkName)) {
                service.networks[networkName] = {};
            }
        },

        /**
         * Run a preset against the YAML document itself, then push the result
         * back into the editor. Going through the document rather than
         * `jsonConfig` keeps the pasted file's comments, key order and quoting.
         */
        applyPresetToDocument(mutate) {
            let doc;
            try {
                doc = parseDocument(this.stack.composeYAML);
                if (doc.errors.length > 0) {
                    throw doc.errors[0];
                }
            } catch (e) {
                this.$root.toastError(e.message || String(e));
                return 0;
            }

            const changed = mutate(doc);
            if (changed > 0) {
                this.stack.composeYAML = doc.toString();
                this.yamlCodeChange();
            }
            return changed;
        },

        async applyNetworkPreset() {
            const attached = this.applyPresetToDocument(
                doc => applyDefaultExternalNetworkToDoc(doc, this.stackDefaults.defaultExternalNetwork)
            );
            if (attached > 0) {
                this.$root.toastSuccess(this.$t("networkPresetApplied", [ attached ]));
                await this.allocateInternalIPs();
            }
        },

        allocateInternalIPs() {
            const networkName = this.stackDefaults.internalIPNetwork || this.stackDefaults.defaultExternalNetwork;
            if (!networkName) {
                return Promise.resolve(true);
            }

            return new Promise((resolve) => {
                this.$root.emitAgent(
                    this.endpoint,
                    "allocateInternalIPs",
                    [ this.jsonConfig, this.envsubstJSONConfig ],
                    async (res) => {
                        if (!res?.ok || !Array.isArray(res.allocations)) {
                            if (res) {
                                this.$root.toastRes(res);
                            }
                            resolve(false);
                            return;
                        }

                        const changed = applyInternalIPAllocations(
                            this.jsonConfig,
                            networkName,
                            res.allocations
                        );
                        if (changed > 0) {
                            await this.$nextTick();
                            this.$root.toastSuccess(this.$t("internalIPAllocated", [ changed ]));
                        }
                        resolve(true);
                    }
                );
            });
        },

        collectCurrentEditorPorts() {
            const ports = [];
            for (const config of [ this.jsonConfig, this.envsubstJSONConfig ]) {
                for (const service of Object.values(config.services ?? {})) {
                    if (service && typeof service === "object" && Array.isArray(service.ports)) {
                        ports.push(...service.ports);
                    }
                }
            }
            return ports;
        },

        applyPortPreset() {
            const plan = this.portPreset;
            if (plan.rewritable.length === 0) {
                return;
            }

            const requests = plan.rewritable.map(entry => ({
                serviceName: entry.serviceName,
                index: entry.index,
                targetPort: Number(entry.target),
                protocol: entry.protocol,
            }));

            this.allocatingPorts = true;
            this.$root.emitAgent(
                this.endpoint,
                "allocatePublishedPorts",
                requests,
                this.collectCurrentEditorPorts(),
                (res) => {
                    this.allocatingPorts = false;
                    if (!res?.ok || !Array.isArray(res.allocations)) {
                        if (res) {
                            this.$root.toastRes(res);
                        }
                        return;
                    }

                    const changed = this.applyPresetToDocument(
                        doc => applyPortRewritesToDoc(
                            doc,
                            plan,
                            res.allocations,
                            this.stackDefaults.publishedHostIPVariable
                        )
                    );
                    if (changed > 0) {
                        this.$root.toastSuccess(this.$t("portPresetApplied", [ changed ]));
                    }
                }
            );
        },

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode && this.hasUnsavedChanges) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.$nextTick(() => this.captureStackSnapshot());
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        async deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services || Object.keys(this.jsonConfig.services).length === 0) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            if (!await this.allocateInternalIPs()) {
                this.processing = false;
                return;
            }

            if (this.isAdd && (this.creationSource === "local" || this.relativeBuildContexts.length > 0) && !this.localProjectReady) {
                this.$root.toastError(this.$t(this.localProjectSource === "server" ? "serverProjectPathRequired" : "localProjectFolderRequired"));
                this.processing = false;
                return;
            }

            if (this.isAdd && this.localProjectSource === "server" && this.serverProjectReady) {
                try {
                    const res = await this.importServerProject(true);
                    this.handleStackSubmitResponse(res);
                } catch (error) {
                    this.handleStackSubmitError(error, () => this.deploySavedStack());
                }
                return;
            }

            if (this.isAdd && this.buildContextFiles.length > 0) {
                try {
                    const res = await this.uploadBuildContext(true);
                    this.handleStackSubmitResponse(res);
                } catch (error) {
                    this.handleStackSubmitError(error, () => this.deploySavedStack());
                }
                return;
            }

            try {
                const res = await this.emitAgentRequest(
                    "deployStack",
                    this.stack.name,
                    this.stack.composeYAML,
                    this.stack.composeENV,
                    this.isAdd
                );
                this.handleStackSubmitResponse(res);
            } catch (error) {
                this.handleStackSubmitError(error, () => this.deploySavedStack());
            }
        },

        async saveStack() {
            this.processing = true;

            if (this.isAdd && (this.creationSource === "local" || this.relativeBuildContexts.length > 0) && !this.localProjectReady) {
                this.$root.toastError(this.$t(this.localProjectSource === "server" ? "serverProjectPathRequired" : "localProjectFolderRequired"));
                this.processing = false;
                return;
            }

            if (!await this.allocateInternalIPs()) {
                this.processing = false;
                return;
            }

            if (this.isAdd && this.localProjectSource === "server" && this.serverProjectReady) {
                try {
                    const res = await this.importServerProject(false);
                    this.handleStackSubmitResponse(res);
                } catch (error) {
                    this.handleStackSubmitError(error);
                }
                return;
            }

            if (this.isAdd && this.buildContextFiles.length > 0) {
                try {
                    const res = await this.uploadBuildContext(false);
                    this.handleStackSubmitResponse(res);
                } catch (error) {
                    this.handleStackSubmitError(error);
                }
                return;
            }

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.handleStackSubmitResponse(res);
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                if (this.showBindMountSetup(res, () => this.startStack())) {
                    return;
                }
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                if (this.showBindMountSetup(res, () => this.updateStack())) {
                    return;
                }
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        gitPullAndBuildStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "gitPullAndBuildStack", this.stack.name, (res) => {
                if (this.showBindMountSetup(res, () => this.gitPullAndBuildStack())) {
                    return;
                }
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteDialog() {
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        discardStack() {
            const hasChanges = this.hasUnsavedChanges;
            if (hasChanges && !confirm(this.$t("confirmDiscardStack"))) {
                return;
            }
            if (hasChanges) {
                this.loadStack();
            }
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                const env = {};
                if (this.stackDefaults.publishedHostIPValue) {
                    env[this.stackDefaults.publishedHostIPVariable] = this.stackDefaults.publishedHostIPValue;
                }
                Object.assign(env, dotenv.parse(this.stack.composeENV));
                const hostIPVariable = this.stackDefaults.publishedHostIPVariable;
                let composeYAMLForPreview = this.stack.composeYAML;
                if (env[hostIPVariable]) {
                    composeYAMLForPreview = resolveRequiredEnvironmentVariable(
                        composeYAMLForPreview,
                        hostIPVariable,
                        env[hostIPVariable]
                    );
                }
                let envYAML = envsubstYAML(composeYAMLForPreview, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            if (!this.canEditStack) {
                this.$root.toastError("Stop the stack before editing files.");
                return;
            }
            this.isEditMode = true;
        },

        captureStackSnapshot() {
            this.savedStackSnapshot = {
                composeYAML: this.stack.composeYAML || "",
                composeENV: this.stack.composeENV || "",
            };
        },

        checkYAML() {

        },

        async addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            const newService = {
                restart: "unless-stopped",
            };
            this.ensureDefaultExternalNetworkForService(newService);
            this.jsonConfig.services[this.newContainerName] = newService;
            this.newContainerName = "";
            await this.allocateInternalIPs();
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

        startService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                if (this.showBindMountSetup(res, () => this.startService(serviceName))) {
                    return;
                }
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        stopService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        restartService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";
@import "../styles/design-tokens.scss";

// ============================================
// Modern Compose Page Styles
// ============================================

h1 {
    font-family: var(--font-display);
    font-size: 1.55rem;
    font-weight: 650;
    letter-spacing: normal;
    margin-bottom: 0.75rem;
    color: $text-primary;
}

h1 :deep(.badge) {
    min-width: 0;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    line-height: 1;
    vertical-align: middle;
}

h4 {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 0.75rem;
    letter-spacing: normal;
}

// Enhanced shadow-box
.shadow-box {
    background: $surface-raised;
    border: 1px solid $border-subtle;
    border-radius: 8px;
    padding: 14px;
    box-shadow: none;
    transition: border-color 120ms ease, background-color 120ms ease;

    &:hover {
        border-color: $border-default;
    }

    &.big-padding {
        padding: 16px;
    }
}

// Button enhancements
.btn {
    min-height: 32px;
    border-radius: 6px;
    font-weight: 500;
    padding: 5px 11px;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
    border: 1px solid transparent;

    &.btn-primary {
        background: #2da7d8;
        color: $surface-deepest;

        &:hover:not(:disabled) {
            background: #47b8e3;
        }
    }

    &.btn-secondary {
        background: $surface-elevated;
        color: $text-primary;
        border: 1px solid $border-default;

        &:hover:not(:disabled) {
            background: $surface-raised;
            border-color: $border-strong;
        }
    }

    &.btn-normal {
        background: $surface-elevated;
        color: $text-secondary;
        border: 1px solid $border-subtle;

        &:hover:not(:disabled) {
            background: $surface-raised;
            color: $text-primary;
            border-color: $border-default;
        }
    }

    &.btn-danger {
        background: $accent-danger;
        color: white;

        &:hover:not(:disabled) {
            background: darken($accent-danger, 5%);
        }
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

// Form enhancements
.form-control, .form-select {
    background: $surface-elevated;
    border: 1px solid $border-default;
    border-radius: 6px;
    color: $text-primary;
    padding: 7px 10px;
    transition: all var(--transition-fast);
    font-size: 0.875rem;

    &::placeholder {
        color: $text-muted;
    }

    &:focus {
        background: $surface-raised;
        border-color: $accent-primary;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
        outline: none;
    }
}

.form-label {
    color: $text-secondary;
    font-weight: 500;
    font-size: 0.78rem;
    margin-bottom: 0.4rem;
    letter-spacing: normal;
    text-transform: none;
}

.form-text {
    color: $text-muted;
    font-size: var(--text-xs);
    margin-top: var(--space-2);
}

.build-context-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);

    progress {
        width: min(180px, 45%);
        height: 8px;
    }
}

.source-selector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);

    .btn {
        min-width: 0;
        white-space: normal;
    }
}

.project-source-selector {
    margin-top: 0;
}

.project-path-input {
    flex-wrap: nowrap;

    .btn {
        white-space: nowrap;
    }
}

// Input group
.input-group {
    display: flex;
    gap: var(--space-2);

    .form-control {
        flex: 1;
        border-radius: 6px;
    }

    .btn {
        border-radius: 6px;
    }
}

// Terminal styling
.terminal {
    height: 200px;
    background: $surface-deep;
    border: 1px solid $border-subtle;
    border-radius: 8px;
    padding: 12px;
    font-family: var(--font-mono);
    box-shadow: none;
}

// Editor box
.editor-box {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: $surface-deep;
    border: 1px solid $border-subtle;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: none;
    transition: border-color 120ms ease;

    &.edit-mode {
        border-color: $accent-primary;
    }

    &:hover {
        border-color: $border-default;
    }
}

// Paste area
.paste-area {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: $surface-elevated;
    border: 2px dashed $border-default;
    border-radius: 8px;
    padding: 14px;
    min-height: 200px;
    color: $text-secondary;
    transition: all var(--transition-base);

    &:focus-within {
        border-color: $accent-primary;
        border-style: solid;
        background: $surface-raised;
    }

    &:hover {
        border-color: $border-strong;
        background: $surface-raised;
    }
}

// Preset list
.preset-list {
    font-size: var(--text-sm);
    list-style: none;
    margin-bottom: 0;
    padding-left: 0;

    li {
        padding: var(--space-2) 0;
        color: $text-secondary;
        transition: color var(--transition-fast);

        &:hover {
            color: $text-primary;
        }
    }
}

// Agent name badge
.agent-name {
    display: inline-flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: $text-muted;
    background: $surface-elevated;
    border-radius: var(--radius-pill);
    margin-left: var(--space-3);
}

.bind-mount-setup-item {
    padding: var(--space-4) 0;
    border-top: 1px solid $border-subtle;

    &:first-of-type {
        border-top: 0;
        padding-top: 0;
    }
}

.bind-mount-source-label {
    color: $text-muted;
    font-size: var(--text-xs);
    margin-bottom: var(--space-1);
}

.bind-mount-source {
    display: block;
    overflow-wrap: anywhere;
    color: $text-primary;
}

.bind-mount-uses {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
    color: $text-muted;
    font-size: var(--text-sm);

    code {
        overflow-wrap: anywhere;
    }
}

.bind-mount-type-selector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: min(100%, 360px);

    .btn {
        min-width: 0;
    }
}

.bind-mount-content {
    resize: vertical;
    min-height: 96px;
    font-family: var(--font-mono);
}

.bind-mount-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
}

// Button group
.compose-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    max-width: 100%;

    > .btn-group {
        flex: 1 1 640px;
        min-width: 0;
        max-width: 100%;
    }

    > .btn {
        flex: 0 0 auto;
        width: auto;
    }

    .btn.is-active {
        color: #c9f3ff;
        border-color: rgba(56, 189, 248, 0.65);
        background: rgba(14, 116, 144, 0.35);
    }

    .btn.has-changes {
        color: #fbd38d;
        border-color: rgba(245, 158, 11, 0.55);
        background: rgba(120, 73, 10, 0.25);
    }
}

.unsaved-mark {
    margin-left: 3px;
    color: #f59e0b;
    font-weight: 700;
}

.edit-lock-hint {
    align-self: center;
    color: $text-muted;
    font-family: var(--font-mono);
    font-size: 0.7rem;
}

.stack-files-panel {
    min-height: 170px;
    padding: 16px;
    background:
        linear-gradient(135deg, rgba(56, 189, 248, 0.06), transparent 42%),
        $surface-raised;
    border-color: rgba(56, 189, 248, 0.2);
}

.stack-files-heading,
.stack-file-row {
    display: flex;
    align-items: center;
    gap: 9px;
}

.stack-files-heading {
    color: $text-primary;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.stack-files-state {
    margin-left: auto;
    color: #67e8f9;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 500;
}

.stack-file-row {
    margin-top: 14px;
    padding: 9px 10px;
    color: $text-muted;
    border: 1px solid $border-subtle;
    border-radius: 6px;
    background: rgba(8, 13, 20, 0.35);

    code {
        flex: 1;
        overflow: hidden;
        color: $text-primary;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    span {
        color: $text-muted;
        font-family: var(--font-mono);
        font-size: 0.64rem;
    }
}

.stack-files-note {
    margin-top: 14px;
    color: $text-muted;
    font-size: 0.75rem;
}

.btn-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;

    .btn {
        flex: 0 1 auto;
        border-radius: 6px !important;
    }
}

// Container list styling
div[ref="containerList"] {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

// Animations
@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.slide-fade-enter-active {
    animation: slideInUp var(--transition-slow);
}

// Responsive adjustments
@media (max-width: 992px) {
    .btn-group {
        width: 100%;

        .btn {
            flex: 1;
            min-width: auto;
        }
    }
}
</style>
