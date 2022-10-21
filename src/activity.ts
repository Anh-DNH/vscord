import { debug, DiagnosticSeverity, env, languages, Selection, TextDocument, window, workspace } from "vscode";
import { getFileIcon, resolveFileIcon, toLower, toTitle, toUpper } from "./helpers/resolveFileIcon";
import { type SetActivity } from "@xhayper/discord-rpc";
import { getFileSize } from "./helpers/getFileSize";
import { isExcluded } from "./helpers/isExcluded";
import { isObject } from "./helpers/isObject";
import { getConfig } from "./config";
import { dataClass } from "./data";
import { sep } from "node:path";
import {
    CONFIG_KEYS,
    DEBUGGING_IMAGE_KEY,
    EMPTY,
    FAKE_EMPTY,
    IDLE_VSCODE_IMAGE_KEY,
    IDLE_VSCODE_INSIDERS_IMAGE_KEY,
    REPLACE_KEYS,
    VSCODE_IMAGE_KEY,
    VSCODE_INSIDERS_IMAGE_KEY,
    VSCODIUM_IMAGE_KEY,
    VSCODIUM_INSIDERS_IMAGE_KEY
} from "./constants";

let totalProblems = 0;

export function onDiagnosticsChange() {
    const diagnostics = languages.getDiagnostics();

    let counted = 0;

    diagnostics.forEach((diagnostic) => {
        if (diagnostic[1]) {
            diagnostic[1].forEach((diagnostic) => {
                if (
                    diagnostic.severity === DiagnosticSeverity.Warning ||
                    diagnostic.severity === DiagnosticSeverity.Error
                )
                    counted++;
            });
        }
    });

    totalProblems = counted;
}

// TODO: Idle small image
// TODO: Polish function
// TODO: Polish replace keys
export function activity(previous: SetActivity = {}, isViewing = false): SetActivity {
    const config = getConfig();
    const { appName } = env;

    const isInsider = appName.includes("Insiders");
    const isCodium = appName.startsWith("VSCodium") || appName.startsWith("codium");

    const defaultSmallImageKey = config
        .get(CONFIG_KEYS.Status.Image.Small.Key)
        .replace(
            REPLACE_KEYS.SmallImageIcon,
            debug.activeDebugSession
                ? config.get(CONFIG_KEYS.Status.Image.Small.Debugging.Key)
                : isInsider
                ? getFileIcon(isCodium ? VSCODIUM_INSIDERS_IMAGE_KEY : VSCODE_INSIDERS_IMAGE_KEY)
                : getFileIcon(isCodium ? VSCODIUM_IMAGE_KEY : VSCODE_IMAGE_KEY)
        );

    const defaultSmallImageText = config
        .get(CONFIG_KEYS.Status.Image.Small.Text)
        .replace(REPLACE_KEYS.AppName, appName);
    const defaultLargeImageText = config.get(CONFIG_KEYS.Status.Image.Large.Idle.Text);

    const removeDetails = !config.get(CONFIG_KEYS.Status.Details.Enabled);
    const removeDetailsOnIdle = !config.get(CONFIG_KEYS.Status.Details.Idle.Enabled);
    const removeState = !config.get(CONFIG_KEYS.Status.State.Enabled);
    const removeStateOnIdle = !config.get(CONFIG_KEYS.Status.State.Idle.Enabled);

    let presence: SetActivity = {
        details:
            removeDetails || removeDetailsOnIdle
                ? undefined
                : details(
                      CONFIG_KEYS.Status.Details.Text.Idle,
                      CONFIG_KEYS.Status.Details.Text.Viewing,
                      CONFIG_KEYS.Status.Details.Text.Editing,
                      CONFIG_KEYS.Status.Details.Text.Debugging,
                      isViewing
                  ),
        state:
            removeState || removeStateOnIdle
                ? undefined
                : details(
                      CONFIG_KEYS.Status.State.Text.Idle,
                      CONFIG_KEYS.Status.State.Text.Viewing,
                      CONFIG_KEYS.Status.State.Text.Editing,
                      CONFIG_KEYS.Status.State.Text.Debugging,
                      isViewing
                  ),
        startTimestamp: config.get(CONFIG_KEYS.Status.Idle.ResetElapsedTime)
            ? undefined
            : previous.startTimestamp ?? new Date(),
        largeImageKey: config
            .get(CONFIG_KEYS.Status.Image.Large.Idle.Key)
            .replace(
                REPLACE_KEYS.LargeImageIdleIcon,
                isInsider ? IDLE_VSCODE_IMAGE_KEY : IDLE_VSCODE_INSIDERS_IMAGE_KEY
            ),
        largeImageText: defaultLargeImageText,
        smallImageKey: defaultSmallImageKey,
        smallImageText: defaultSmallImageText
    };

    if (window.activeTextEditor) {
        const largeImageKey = resolveFileIcon(window.activeTextEditor.document);
        const largeImageText = config
            .get(CONFIG_KEYS.Status.Image.Large.Text)
            .replace(REPLACE_KEYS.LanguageLowerCase, toLower(largeImageKey))
            .replace(REPLACE_KEYS.LanguageTitleCase, toTitle(largeImageKey))
            .replace(REPLACE_KEYS.LanguageUpperCase, toUpper(largeImageKey))
            .padEnd(2, FAKE_EMPTY);

        let isWorkspaceExcluded = false;
        let workspaceExcludedText = "No workspace ignore text provided.";

        if (dataClass.workspaceFolder && "uri" in dataClass.workspaceFolder) {
            isWorkspaceExcluded = isExcluded(
                config.get(CONFIG_KEYS.Ignore.Workspaces),
                dataClass.workspaceFolder.uri.fsPath
            );
        }

        if (isWorkspaceExcluded && dataClass.workspaceFolder && dataClass.workspaceFolder.name) {
            const ignoreWorkspacesText = config.get(CONFIG_KEYS.Ignore.WorkspacesText);

            workspaceExcludedText = isObject(ignoreWorkspacesText)
                ? ignoreWorkspacesText[dataClass.workspaceFolder.name]
                : ignoreWorkspacesText
                ? ignoreWorkspacesText
                : "No workspace ignore text provided.";
        }

        presence = {
            ...presence,
            details: removeDetails
                ? undefined
                : isWorkspaceExcluded
                ? workspaceExcludedText
                : details(
                      CONFIG_KEYS.Status.Details.Text.Idle,
                      CONFIG_KEYS.Status.Details.Text.Viewing,
                      CONFIG_KEYS.Status.Details.Text.Editing,
                      CONFIG_KEYS.Status.Details.Text.Debugging,
                      isViewing
                  ),
            state: removeState
                ? undefined
                : isWorkspaceExcluded
                ? undefined
                : details(
                      CONFIG_KEYS.Status.State.Text.Idle,
                      CONFIG_KEYS.Status.State.Text.Viewing,
                      CONFIG_KEYS.Status.State.Text.Editing,
                      CONFIG_KEYS.Status.State.Text.Debugging,
                      isViewing
                  ),
            largeImageKey: config.get(CONFIG_KEYS.Status.Image.Large.Key).replace("{lang}", largeImageKey),
            largeImageText
        };

        if (config.get(CONFIG_KEYS.Status.Button.Active.Enabled) && dataClass.gitRemoteUrl) {
            const gitRepo = dataClass.gitRemoteUrl.toString("https").replace(/\.git$/, "");
            const gitOrg = dataClass.gitRemoteUrl.organization ?? dataClass.gitRemoteUrl.owner;
            const gitHost = dataClass.gitRemoteUrl.source;

            const isRepositoryExcluded = isExcluded(config.get(CONFIG_KEYS.Ignore.Repositories), gitRepo);

            const isOrganizationExcluded = isExcluded(config.get(CONFIG_KEYS.Ignore.Organizations), gitOrg);

            const isGitHostExcluded = isExcluded(config.get(CONFIG_KEYS.Ignore.GitHosts), gitHost);

            const isNotExcluded =
                !isRepositoryExcluded && !isWorkspaceExcluded && !isOrganizationExcluded && !isGitHostExcluded;

            if (gitRepo && config.get(CONFIG_KEYS.Status.Button.Active.Label) && isNotExcluded)
                presence = {
                    ...presence,
                    buttons: [
                        {
                            label: config.get(CONFIG_KEYS.Status.Button.Active.Label),
                            url:
                                config.get(CONFIG_KEYS.Status.Button.Active.Url) != ""
                                    ? config.get(CONFIG_KEYS.Status.Button.Active.Url)
                                    : gitRepo
                        }
                    ]
                };
        }
    } else if (
        !!config.get(CONFIG_KEYS.Status.Button.Inactive.Enabled) &&
        !!config.get(CONFIG_KEYS.Status.Button.Inactive.Label) &&
        !!config.get(CONFIG_KEYS.Status.Button.Inactive.Url)
    )
        presence.buttons = [
            {
                label: config.get(CONFIG_KEYS.Status.Button.Inactive.Label),
                url: config.get(CONFIG_KEYS.Status.Button.Inactive.Url)
            }
        ];

    return presence;
}

function details(idling: string, viewing: string, editing: string, debugging: string, isViewing: boolean) {
    const config = getConfig();

    let raw = (config.get(idling) as string).replace(REPLACE_KEYS.Empty, FAKE_EMPTY);

    if (window.activeTextEditor) {
        const noWorkspaceFound = config
            .get(CONFIG_KEYS.Status.State.Text.NoWorkspaceFound)
            .replace(REPLACE_KEYS.Empty, FAKE_EMPTY);

        const workspaceFolderName = dataClass.workspaceFolder ? dataClass.workspaceFolder.name : noWorkspaceFound;
        const workspaceName = dataClass.workspace
            ? dataClass.workspace.replace(REPLACE_KEYS.VSCodeWorkspace, EMPTY)
            : workspaceFolderName;
        const workspaceAndFolder = `${workspaceName}${
            workspaceFolderName === FAKE_EMPTY ? "" : ` - ${workspaceFolderName}`
        }`;

        const fileIcon = resolveFileIcon(window.activeTextEditor.document);
        const fileSize = getFileSize(config, dataClass);

        const problems = config.get(CONFIG_KEYS.Status.Problems.Enabled)
            ? config.get(CONFIG_KEYS.Status.Problems.Text).replace(REPLACE_KEYS.ProblemsCount, totalProblems.toString())
            : "";

        raw = config.get(debug.activeDebugSession ? debugging : isViewing ? viewing : editing) as string;

        if (dataClass.workspace) {
            const name = dataClass.workspace;
            const relativePath = workspace.asRelativePath(window.activeTextEditor.document.fileName).split(sep);

            relativePath.splice(-1, 1);
            raw = raw.replace(REPLACE_KEYS.FullDirName, `${name}${sep}${relativePath.join(sep)}`);
        }

        raw = fileDetails(raw, window.activeTextEditor.document, window.activeTextEditor.selection);

        raw = raw
            .replace(REPLACE_KEYS.FileName, dataClass.fileName ?? FAKE_EMPTY)
            .replace(REPLACE_KEYS.FileExtension, dataClass.fileExtension ?? FAKE_EMPTY)
            .replace(REPLACE_KEYS.FileSize, fileSize ?? FAKE_EMPTY)
            .replace(REPLACE_KEYS.DirName, dataClass.dirName ?? FAKE_EMPTY)
            .replace(REPLACE_KEYS.Workspace, workspaceName)
            .replace(REPLACE_KEYS.WorkspaceFolder, workspaceFolderName)
            .replace(REPLACE_KEYS.WorkspaceAndFolder, workspaceAndFolder)
            .replace(REPLACE_KEYS.LanguageLowerCase, toLower(fileIcon))
            .replace(REPLACE_KEYS.LanguageTitleCase, toTitle(fileIcon))
            .replace(REPLACE_KEYS.LanguageUpperCase, toUpper(fileIcon))
            .replace(REPLACE_KEYS.Problems, problems)
            .replace(
                REPLACE_KEYS.GitRepo,
                dataClass.gitRemoteUrl ? dataClass.gitRemoteUrl.name : dataClass.gitRepoName ?? FAKE_EMPTY
            )
            .replace(REPLACE_KEYS.GitBranch, dataClass.gitBranchName ?? FAKE_EMPTY)
            .replace(REPLACE_KEYS.FolderAndFile, dataClass.folderAndFile ?? FAKE_EMPTY);
    }

    return raw;
}

function fileDetails(_raw: string, document: TextDocument, selection: Selection) {
    let raw = _raw.slice();

    if (raw.includes(REPLACE_KEYS.TotalLines))
        raw = raw.replace(REPLACE_KEYS.TotalLines, document.lineCount.toLocaleString());

    if (raw.includes(REPLACE_KEYS.CurrentLine))
        raw = raw.replace(REPLACE_KEYS.CurrentLine, (selection.active.line + 1).toLocaleString());

    if (raw.includes(REPLACE_KEYS.CurrentColumn))
        raw = raw.replace(REPLACE_KEYS.CurrentColumn, (selection.active.character + 1).toLocaleString());

    return raw;
}
