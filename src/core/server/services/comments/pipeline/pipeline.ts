import { Db } from "mongodb";

import { Omit, Promiseable, RequireProperty } from "coral-common/types";
import { Config } from "coral-server/config";
import { GQLCOMMENT_STATUS } from "coral-server/graph/tenant/schema/__generated__/types";
import { CreateActionInput } from "coral-server/models/action/comment";
import {
  EditCommentInput,
  RevisionMetadata,
} from "coral-server/models/comment";
import { CommentTag } from "coral-server/models/comment/tag";
import { Story } from "coral-server/models/story";
import { Tenant } from "coral-server/models/tenant";
import { User } from "coral-server/models/user";
import { AugmentedRedis } from "coral-server/services/redis";
import { Request } from "coral-server/types/express";

import { moderationPhases } from "./phases";

export type ModerationAction = Omit<
  CreateActionInput,
  "commentID" | "commentRevisionID" | "storyID"
>;

export interface PhaseResult {
  actions: ModerationAction[];
  status: GQLCOMMENT_STATUS;
  metadata: RevisionMetadata;
  body: string;
  tags: CommentTag[];
}

export interface ModerationPhaseContext {
  mongo: Db;
  redis: AugmentedRedis;
  config: Config;
  story: Story;
  tenant: Tenant;
  comment: RequireProperty<Partial<EditCommentInput>, "body">;
  author: User;
  now: Date;
  action: "NEW" | "EDIT";
  nudge?: boolean;
  req?: Request;
}

export type RootModerationPhase = (
  context: ModerationPhaseContext
) => Promiseable<PhaseResult>;

export type IntermediatePhaseResult = Partial<PhaseResult> | void;

export interface IntermediateModerationPhaseContext
  extends ModerationPhaseContext {
  metadata: RevisionMetadata;
}

export type IntermediateModerationPhase = (
  context: IntermediateModerationPhaseContext
) => Promiseable<IntermediatePhaseResult>;

/**
 * compose will create a moderation pipeline for which is executable with the
 * passed actions.
 */
export const compose = (
  phases: IntermediateModerationPhase[]
): RootModerationPhase => async context => {
  const final: PhaseResult = {
    status: GQLCOMMENT_STATUS.NONE,
    body: context.comment.body,
    actions: [],
    metadata: context.comment.metadata || {},
    tags: [],
  };

  // Loop over all the moderation phases and see if we've resolved the status.
  for (const phase of phases) {
    const result = await phase({
      ...context,
      comment: {
        ...context.comment,
        body: final.body,
      },
      metadata: final.metadata,
    });
    if (result) {
      // If this result contained actions, then we should push it into the
      // other actions.
      const { actions } = result;
      if (actions) {
        final.actions.push(...actions);
      }

      // If this result contained metadata, then we should merge it into the
      // other metadata.
      const { metadata } = result;
      if (metadata) {
        final.metadata = {
          ...final.metadata,
          ...metadata,
        };
      }

      // If the result modified the comment body, we should replace it.
      const { body } = result;
      if (body) {
        final.body = body;
      }

      // If the result added any tags, we should push it into the existing tags.
      const { tags } = result;
      if (tags && tags.length > 0) {
        final.tags.push(
          // Only push in tags that we haven't already added.
          ...tags.filter(
            ({ type }) => !final.tags.some(tag => tag.type === type)
          )
        );
      }

      // If this result contained a status, then we've finished resolving
      // phases!
      const { status } = result;
      if (status) {
        final.status = status;
        break;
      }
    }
  }

  return final;
};

/**
 * process the comment and return moderation details.
 */
export const processForModeration: RootModerationPhase = compose(
  moderationPhases
);
