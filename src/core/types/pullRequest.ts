export interface PullRequestPayload {
    action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'merged' | 'ready_for_review';
    pull_request: {
        id: number;
        number: number;
        title: string;
        body: string | null;
        state: 'open' | 'closed';
        merged: boolean;
        merged_at: string | null;
        html_url: string;
        base: {
            ref: string;
            repo: {
                name: string;
                full_name: string;
            };
        };
        head: {
            ref: string;
            sha: string;
            repo: {
                name: string;
                full_name: string;
            };
        };
        user: {
            login: string;
            avatar_url: string;
        };
        created_at: string;
        updated_at: string;
    };
    repository: {
        name: string;
        full_name: string;
        html_url: string;
    };
    sender: {
        login: string;
        avatar_url: string;
    };
}

export interface GitLabMergeRequestPayload {
    object_kind: 'merge_request';
    event_type: 'merge_request';
    user: {
        name: string;
        username: string;
        avatar_url: string;
    };
    project: {
        name: string;
        path_with_namespace: string;
        web_url: string;
    };
    object_attributes: {
        id: number;
        iid: number;
        title: string;
        description: string;
        state: 'opened' | 'closed' | 'merged';
        merged: boolean;
        merge_status: string;
        source_branch: string;
        target_branch: string;
        url: string;
        created_at: string;
        updated_at: string;
        merged_at: string | null;
    };
}

