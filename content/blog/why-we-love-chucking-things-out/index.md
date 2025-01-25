---
title: If it's not rubbish, why do we love to chuck it out?
date: "2020-02-13T22:12:03.284Z"
description: "An attempt to spark joy"
draft: false
---

_This is part two of a series adapted from a talk me and Reetta gave internally at the Guardian, and then later at Continuous Lifecycle. Thanks, Reetta, for your help with the talk!_

As [part one of this series argued](/its-not-rubbish/), it’s difficult to arrive at  insights about past work if we dismiss it as rubbish. And yet it happens all the time. If we listen closely, at this _very moment_ we can hear the faint clatter of a thousand keystrokes as the comments on Hacker News roll in. The following examples were culled, with a pleasing irony, from the comments section of [The Code Culture Problem](https://news.ycombinator.com/item?id=6333424):

> writing software in PHP or Java is voluntary retardation. You're holding back the advancement of our trade.

> Most code out there is shit code. Denying it is not going to help either.

> Shit code is shit code no matter the circumstances surrounding its creation.

Why are we all so familiar with this tone of voice? Why are are developers -- on occasion, myself included -- so ready to throw code in the bin, possibly along with its creator(s)? Here are a few reasons.

## 1) We rubbish other people' code / framework / language to bolster our status as engineers that know better

This is the most straightforwardly terrible reason to call something rubbish. I've done it, you may have done it. It has an impact on our culture, our co-workers. And, as others have mentioned, [the shit flows downwards](http://fraustollc.com/blog/shit_code/). This isn't an engineering culture that anyone wants.

And yet, in my previous post, the slight sneer when both me and my clients discussed the old theme was definitely palpable. We couldn't possibly make something as clunky as this again, right? Well, we didn't -- by ignoring what was good about the old design, we made something _worse_.

## 2) Code and design work is easier to write than read, and we like to architect with a blank canvas …

As eloquently argued by [Joel Spolsky](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/), a blank canvas is seductive in the face of a messy legacy project. But there's a reason that the older design is likely to do a better job --

> The idea that new code is better than old is patently absurd. Old code has been used. It has been tested. Lots of bugs have been found, and they’ve been fixed. There’s nothing wrong with it. It doesn’t acquire bugs just by sitting around on your hard drive.

It takes time and effort to understand software that already exists, in all its glorious, messy complexity. It is easier to reason about creating something new.

## 3) … often because we think we know better _now_ than we did _then_.

Living in the future is great! We look back at other people's work and the mistakes are clear. This clarity is so useful that we have sophisticated programming methodologies that invoke our future audience --

> Always code as if the person who ends up maintaining your code will be a violent psychopath who knows where you live. [^1]

But hindsight, in our case, isn't twenty-twenty at all. Looking at old projects, we see the mistakes -- but we miss the context in which the code was created. The bugs that were fixed by the complexity we'd dismissed as cruft. The user feedback which meant that doing something _just so_ was worth its weight in gold at the time.

In the first post, one of the reasons we didn't spend the time thinking about the old project was that we didn't take it, or its authors, seriously. The people that made _that_ interface? The same people who chose VB6 and the e-mails? (See point 1.) And wrote that terrible form code? (See point 2.) The same people who had been working with the people that used that software day-in, day-out for over a decade, and knew their users and their use-cases better than anyone? Uhm …

## Software engineering, that humble trade

So how do we avoid this? One way in: _humility_. But that's another post.

[^1]: https://groups.google.com/forum/#!msg/comp.lang.c++/rYCO5yn4lXw/oITtSkZOtoUJ
