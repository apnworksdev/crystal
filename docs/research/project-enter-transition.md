# Opening a Project

What should play when a Project opens, given that the current shared-element morph is laggy on a fast computer? Three entries, and the leave:

1. Home roulette → a Project
2. Work page, reel → a Project
3. Work page, list → a Project (one shared still beside the rows, not a thumbnail on each row)

Leaving a Project goes back to the previous in-site page, or to the Work page when there is no in-site origin. The site header is the player bar. It is one persisted element. On a Project it sits at the bottom, over the video. A second bar is out of scope.

**Fact** and **Judgement** are marked below. Durations such as 0.65s are the authored `animation-duration` values, not a measurement of dropped frames. No primary source times this site's morph. Cost is described as what gets captured and which properties animate.

## Why the current morph costs frames

`ClientRouter` is included only when the site is not in preview. Astro's router calls `document.startViewTransition`, and inside that callback it swaps the body. Elements with `transition:persist` are moved into the new document rather than replaced. Astro's own description of that call is that the browser screenshots the current page. (Astro, [View transitions](https://docs.astro.build/en/guides/view-transitions/), "Client-side navigation process" and "Maintaining State".)

The spec's default transition is a page-wide cross-fade. Anything with a `view-transition-name` other than `none` is captured on its own and animated apart from the rest of the page. The document element is given the name `root` in the user-agent stylesheet, so the root is always one of those captures unless an author rule sets it to `none`. (Spec, [CSS View Transitions Level 1](https://drafts.csswg.org/css-view-transitions-1/), §1, §2.1, §3.2, §5.)

This site currently names all of the following on the way into a Project:

- `:root`, with the cross-fade lengthened to 0.45s in `transitions.css`. The root image is the snapshot containing block: the rectangle of the window that can show page content, not the border box of one card. (Spec §4.1, §7.7.)
- `<main>`, via `transition:animate={fade({ duration: '0.25s' })}`. Astro's default `fade` is a cross-fade, and the directive gives that element its own `view-transition-name`. (Astro, "Built-in Animation Directives".)
- `.site-header`. The header is `transition:persist` and `transition:animate="none"`, but `transitions.css` sets `view-transition-name: site-header !important` so the old and new pages share one name. The group animation runs for 0.65s. `transition:animate="none"` does not remove a name that CSS then sets.
- One project image, named `project-${slug}-media`: the clicked roulette card, the clicked reel card, or, on the list, the shared still after `armListStill`. The Project page puts the same name on `.project__media`. `view-transition-class: project-media` only shares the 0.65s rules across those names. The class does not itself cause a capture. (Spec Level 2, [§10.3](https://drafts.csswg.org/css-view-transitions-2/#the-view-transition-class-property).)
- The footer, which has `transition:name="site-footer"` and `transition:animate="none"`. `none` turns the animation off. The name still marks it for capture while it is rendered.

`armProjectMedia` sets every other roulette and reel card to `view-transition-name: none` before the router runs, so a click does not capture every card. The names are on every card until that click.

**Fact.** Capture of a named element renders that element and its descendants to an image. For the document element, the image is the size of the snapshot containing block. Named descendants are left out of an ancestor's image because they have their own snapshot. Effects such as opacity are applied while capturing. (`::view-transition-old()` and `::view-transition-new()` are replaced elements; their content is that captured image.) (Spec §3.2.5, §3.2.6, §7.7, §7.7.1.)

On a Project, `.project__media` is `position: fixed; inset: 0`. Its border box is the viewport. The Vimeo `<iframe>` is a child of that element, so it is inside the subtree that gets rendered into the image. The frame's opacity is 0 until playback starts, and the spec applies that opacity to the capture, so the visible pixels can be the black background. The iframe is still part of the captured subtree. The spec also says a captured image can include cross-origin embedded resources, which a Vimeo frame is. (Spec §7.7, §7.7.1, Security Considerations.)

**Fact.** The old image is taken once. While the transition's phase is `animating`, each turn of the rendering loop runs "handle transition frame", which updates pseudo-element styles and sets the new pseudo-element's replaced content by capturing the new element again. (Spec §7.2, §7.8, §7.9.) Chrome describes the same split in implementation terms: `::view-transition-old` is a screenshot, and `::view-transition-new` is a live representation of the new node, also rendered as replaced content. A video on the new side keeps playing; a video on the old side is frozen for the cross-fade. ([Same-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document), "How these transitions work" and "Run transitions without freezing other animations"; [misconceptions](https://developer.chrome.com/blog/view-transitions-misconceptions), Misconception 1.)

**Fact.** When both states exist, the generated group animation interpolates `width`, `height`, and `transform` from the old border box to the new one. The user-agent stylesheet also cross-fades old and new (`opacity`, plus a `plus-lighter` blend) over 0.25s unless author CSS replaces it. This site replaces the fade timing for root (0.45s), for the project-media class (0.65s), and for the header (0.65s), and it stretches the media snapshots with `width`/`height: 100%` and `object-fit: cover`. (Spec §3.2.3, §5, §7.9; Chrome, "Default style and transition reference".)

**Fact.** Chrome's note on that group animation: animating `width` and `height` on `::view-transition-group` runs layout per frame. An optimization to take that off the main thread is planned and, in that article, not implemented. (Chrome, "Handle changes in aspect ratio".) Separately, Chrome says the act of reading the snapshot is not an extra layout or repaint: the pixels come from the compositor, and for `pageswap` the stall is at most two stale frames. ([Misconception 5](https://developer.chrome.com/blog/view-transitions-misconceptions).) That figure is Chrome's claim about preparing a cross-document capture. It is not a measurement of this morph. The morph then holds the result on screen for the authored 0.45s and 0.65s while `width` and `height` interpolate and the new side stays live.

**Fact.** The `::view-transition` layer paints after all other content of the document, including the top layer. While the phase is `animating`, a captured element is not painted in its DOM position (as if `opacity: 0`) and does not hit-test. (Spec §4, §4.2.) The live header is `z-index: 2` and the Project media is `z-index: 1`, so in normal paint the header sits over the video. During this morph the header is itself captured, so the thing on screen is the header's snapshot pair, not the live element. `slideHeader` sees that pseudo-animation and skips its own `translate` / `scaleX`. The Web Animations fallback runs only when the morph did not.

**Fact.** Astro says the reload of an iframe cannot be avoided during a view transition, even with `transition:persist`. (Astro, "Maintaining State".) The Project iframe is not persisted. It is inserted with the new page, inside the `startViewTransition` callback. Chrome says that callback freezes the page, and that network work should happen before the call, not inside it. (Chrome, "Async DOM updates, and waiting for content".)

**Judgement.** The lag is this combination, not any one fade: a viewport-sized root image, a second named image for `<main>`, a viewport-sized new Project media image whose subtree includes the iframe, and a header image whose box changes from the mid-left bubble to the full-width bar, all while the groups animate `width` and `height` and the new images stay live. `whenViewTransitionsDone` already waits before `play()`, and the frame is already `opacity: 0` until then. That hides the picture. It does not take the iframe out of the named subtree, and it does not stop the group from laying out `width` and `height` for 0.65s.

## What is cheap, and what is only cheap in judgement

**Fact.** Chrome's rendering guidance: before animating any property other than `transform` and `opacity`, check its cost; those two are the ones to keep on the compositing stage. Animating something that triggers layout or paint is called out as unlikely to stay smooth. ([Animations guide](https://web.dev/articles/animations-guide), "Avoid properties that trigger layout or paint" and "Animate at the composite stage".) The same guide does not discuss view transitions. The view-transition claim that matches it is Chrome's own note that the group's `width` and `height` animation runs layout per frame.

**Fact.** A solid colour is not given a cost in the spec or in that guide. `opacity` on an element that is only a colour is the case the guide does cover. The spec's view-transition layer can take a background colour, and Chrome points that out as a reason the overlay sits over the page. (Chrome, "How these transitions work".) That colour would be on the overlay, which paints above the live header.

**Fact.** If an element is not in the tree, it is not a descendant, and "capture the image" does not render it. `view-transition-name: none` skips the element. If nothing is captured, or no view-transition animations run, Chrome says the DOM swaps with no animation. (Spec §2.1, §7.3.1, §7.7; Chrome misconceptions, Misconception 3.)

**Judgement.** Three mechanisms stay on the compositor, or avoid a capture entirely:

- Move or fade a live element with `transform` and `opacity` only. The header fallback already does this: `translate` and `scaleX` from the box recorded in `rememberHeaderBox`. One layout when the Project styles apply, then a transform. That is not the group's per-frame `width` and `height`.
- Cover the clicked image with a live black layer and fade or scale that layer. The black is a colour plus `opacity` or `transform`. It is not a snapshot. This matches the guide. It is not a claim the spec makes.
- Put the iframe in the document only after that animation. The page can stay black without a player in the tree. Waiting to call `play()` while the iframe is already inside a named, viewport-sized element does not do this.

**Judgement.** The same black, implemented as a named view transition of a viewport-sized box, is the current morph again: a full-viewport group, a live new image, and an overlay that covers the live header.

## Recommendation

Use one sequence. Change only which rectangle the black starts from. Do not morph pixels from the still into the player.

The header stays the persisted site header, with no `view-transition-name`. It is the live element, above the video by its existing stacking (`z-index: 2` over the media's `z-index: 1`). It moves with the `translate` / `scaleX` it already has for the case when the morph is skipped. It is not a second snapshot and not a second bar. The root, `<main>`, the Project media, and the cards should not have a `view-transition-name` for this navigation, so `ClientRouter` can still swap the page without building those images. Astro will call `startViewTransition` anyway. With no names, the spec captures nothing and Chrome's note is that the swap then has no animation.

Then:

1. On the click, cover the source image (below) with a live black layer. Grow that black to the viewport with `transform` (and fade it with `opacity` if the still should dissolve rather than get cropped). Do not animate the black layer's `width` or `height`.
2. Swap to the Project. `.project__media` is already black, and the frame stays invisible. The header, still the same node, slides to the bottom bar.
3. When that transform has finished, add the video and start playback. An image Project fades its image in with `opacity` at the same moment. The video is not on screen during the cover.

`prefers-reduced-motion` already sets the view-transition animations to `none`, and `slideHeader` already bails out. The black grow should bail out the same way and land on the settled Project.

### Home roulette

The source rectangle is the clicked card, one slide in the track. Cover that card. The other slides are not named and do not move on their own; the black covers them as it grows. The card is not the viewport, so the scale starts from the card's box.

### Work page, reel

The source rectangle is the clicked reel card, the front of the stack. Cover that card. The cards behind it stay where they are and disappear under the same black. They do not each get a transition. The card is large, so the scale is shorter than on the roulette, but it is the same black layer, not a shared bitmap morph.

### Work page, list

The source rectangle is the shared still, `.work-list__still`, not the row. The row does not grow. `armListStill` already points that still at the Project being opened; the black covers the still that is showing. The rows leave with the page swap.

### Leaving a Project

Reverse the same sequence. Hide the video first, so the leave starts from black and the iframe is not in a capture. The header slides back to the mid-left bubble with the same live transform. The black then shrinks onto the place this Project occupies on the page being revealed:

- Home roulette, or the Work page reel: that Project's card.
- Work page list: the shared still, switched to this Project before the black uncovers. The row is not the target.

`leaveProject` already goes back when the visit started from an in-site click, and otherwise opens the Work page. The uncover follows whichever of those is actually showing, including the Work page's current reel or list view. Reduced motion skips the shrink and shows the settled page.

## Preview

**Fact.** Preview does not include `ClientRouter`, so a navigation is a full page load. `transitions.css` also sets `@view-transition { navigation: auto }`. Level 2 starts a cross-document view transition on a same-origin navigation when both documents opt in with that rule. The capture is the same named-element mechanism as a same-document transition. (Spec Level 2, [§8.1.1](https://drafts.csswg.org/css-view-transitions-2/#cross-document-view-transition-activation), [§8.3.2](https://drafts.csswg.org/css-view-transitions-2/#the-navigation-descriptor); Chrome, [Cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document).) Both the old page and the Project page include that stylesheet, so preview can still snapshot the header and the media on a full load.

**Judgement.** Preview should not run this transition. The Project should arrive settled: black media, the header already at the bottom because that is what the Project CSS does, and the video only after load. No shared name on the media or the header, so the cross-document opt-in has nothing of this enter to capture. Click-to-edit needs that stable page. There is no persisted header across a full load, and no `translate` to run; the bar is simply in its player position on first paint.

## Do not

These are the captures tied to the lag. The positive sequence is the one above.

- Do not snapshot the viewport. The root image is the snapshot containing block, and `.project__media` on a Project is `inset: 0`, so its image is viewport-sized too. A black cover does not need either image.
- Do not snapshot the iframe. It is a descendant of the named media, the new side stays live, and Astro will reload an iframe that is present during the transition. Add it after the cover.
- Do not snapshot every card. Each `view-transition-name` is its own image. `armProjectMedia` already clears the cards that were not clicked; the clicked card should be cleared too. The list has one still, and that still should not be named either.
- Do not run the root cross-fade on top of a morph. The user-agent cross-fade of `root`, Astro's fade on `<main>`, and the 0.65s group animation are three animations of overlapping page-sized images. Dropping the morph and keeping the root fade still captures the viewport.

## The idea that was floated

A background colour goes to black on top of the clicked image, then the video shows, and the nav stays over everything.

**Judgement.** The picture is the right one, and it should not be built as a view transition. As a live black layer on the source rectangle, then the video, it is the recommendation above. The nav stays over everything because it is the live header and there is no view-transition layer above it. Built as a snapshot, the black is another viewport-sized group, and the spec paints that layer after the whole document, so the live header would sit underneath it unless the header were snapshotted too. That is the morph this note is trying to stop.

## Sources

Spec facts are from the drafts. Chrome and web.dev are first-party browser docs; the web.dev piece is rendering guidance, not the view-transition spec. Astro's guide is the source for what `ClientRouter` does.

- [CSS View Transitions Module Level 1](https://drafts.csswg.org/css-view-transitions-1/). §1 (default cross-fade and named captures); §2.1 (`view-transition-name`, including `none`); §3.2 and §3.2.3–§3.2.6 (separate captures, the `root` name, group `width`/`height`/`transform`, old and new as replaced elements); §4 and §4.1–§4.2 (snapshot containing block, layer above the document, captured elements not painted); §5 (user-agent cross-fade); §7.2, §7.3.1, §7.7, §7.7.1, §7.8, §7.9 (rendering loop, what is captured, descendants, recapture of the new image); Security Considerations (cross-origin embedded resources in the image).
- [CSS View Transitions Module Level 2](https://drafts.csswg.org/css-view-transitions-2/). §8.1.1 and §8.3.1–§8.3.2 (`@view-transition`, `navigation: auto`, both documents); §10.3–§10.4 (`view-transition-class` styles pseudo-elements and does not by itself capture).
- [Astro: View transitions](https://docs.astro.build/en/guides/view-transitions/). "Built-in Animation Directives" (`fade`, `none`); "Maintaining State" (`transition:persist`, iframes still reload); "Client-side navigation process" (`document.startViewTransition`, screenshot, persisted elements moved across the swap).
- [Chrome: Same-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document). "How these transitions work" (old screenshot, new live replaced content, overlay); "Async DOM updates, and waiting for content" (callback freezes the page); "Handle changes in aspect ratio" (`width` and `height` run layout per frame; off-thread optimization not implemented); "Run transitions without freezing other animations" (old video frozen, new video live); "Default style and transition reference" (group transitions `width`, `height`, and `transform`).
- [Chrome: Cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document). Opt-in with `@view-transition { navigation: auto }` on both pages.
- [Chrome: View transition misconceptions](https://developer.chrome.com/blog/view-transitions-misconceptions). Misconception 1 (new side is live); Misconception 3 (no captures or no animations means a swap with no animation); Misconception 5 (snapshot data from the compositor; `pageswap` at most two stale frames).
- [web.dev: Animations guide](https://web.dev/articles/animations-guide). "Avoid properties that trigger layout or paint"; "Animate at the composite stage" (`opacity` and `transform`).
