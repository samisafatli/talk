import { ReactTestRenderer } from "react-test-renderer";
import timekeeper from "timekeeper";

import { timeout } from "talk-common/utils";
import { createSinonStub } from "talk-framework/testHelpers";

import { assetWithDeepestReplies, settings, users } from "../fixtures";
import create from "./create";

let testRenderer: ReactTestRenderer;
beforeEach(() => {
  const resolvers = {
    Query: {
      asset: createSinonStub(
        s => s.throws(),
        s => s.returns(assetWithDeepestReplies)
      ),
      me: createSinonStub(s => s.throws(), s => s.returns(users[0])),
      settings: createSinonStub(s => s.returns(settings)),
    },
    Mutation: {
      createComment: createSinonStub(
        s => s.throws(),
        s =>
          s
            .withArgs(undefined, {
              input: {
                assetID: assetWithDeepestReplies.id,
                parentID: "comment-with-deepest-replies-5",
                body: "<strong>Hello world!</strong>",
                clientMutationId: "0",
              },
            })
            .returns({
              edge: {
                cursor: null,
                node: {
                  id: "comment-x",
                  author: users[0],
                  body: "<strong>Hello world! (from server)</strong>",
                  createdAt: "2018-07-06T18:24:00.000Z",
                  replies: {
                    edges: [],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  },
                  editing: {
                    edited: false,
                    editableUntil: "2018-07-06T18:24:30.000Z",
                  },
                  actionCounts: {
                    reaction: {
                      total: 0,
                    },
                  },
                },
              },
              clientMutationId: "0",
            })
      ),
    },
  };

  ({ testRenderer } = create({
    // Set this to true, to see graphql responses.
    logNetwork: false,
    resolvers,
    initLocalState: localRecord => {
      localRecord.setValue(assetWithDeepestReplies.id, "assetID");
    },
  }));
});

it("renders comment stream", async () => {
  // Wait for loading.
  await timeout();
  expect(testRenderer.toJSON()).toMatchSnapshot();
});

it("post a reply", async () => {
  // Wait for loading.
  await timeout();

  // Open reply form.
  testRenderer.root
    .findByProps({
      id:
        "comments-commentContainer-replyButton-comment-with-deepest-replies-5",
    })
    .props.onClick();

  await timeout();
  expect(testRenderer.toJSON()).toMatchSnapshot("open reply form");

  // Write reply .
  testRenderer.root
    .findByProps({
      inputId: "comments-replyCommentForm-rte-comment-with-deepest-replies-5",
    })
    .props.onChange({ html: "<strong>Hello world!</strong>" });

  timekeeper.freeze(new Date("2018-07-06T18:24:00.000Z"));
  testRenderer.root
    .findByProps({
      id: "comments-replyCommentForm-form-comment-with-deepest-replies-5",
    })
    .props.onSubmit();
  // Test optimistic response.
  expect(testRenderer.toJSON()).toMatchSnapshot("optimistic response");
  timekeeper.reset();

  // Wait for loading.
  await timeout();

  // Test after server response.
  expect(testRenderer.toJSON()).toMatchSnapshot("server response");
});
