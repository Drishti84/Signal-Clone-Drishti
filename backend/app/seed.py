"""Demo data, written on startup when the database has no users.

Rows are created directly through the models rather than the services,
because the seed needs timestamps in the past. A fixed random seed keeps the
result identical on every start."""

import random
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as Db

from app.models import (Contact, Conversation, ConversationMember, Message,
                        MessageReceipt, Reaction, User, utcnow)

# (name, avatar colour, preset icon, about, minutes since last seen)
USERS = [
    ("Asha Menon", "A100", None, "Chai first, then everything else", 2),
    ("Rohan Verma", "A130", "rocket", "Probably at the climbing gym", 14),
    ("Meera Iyer", "A160", "cat", None, 55),
    ("Kabir Singh", "A180", None, "Available", 190),
    ("Ananya Rao", "A140", "flower", "Designing things", 1500),
    ("Dev Malhotra", "A120", None, None, 35),
    ("Priya Nair", "A170", "music", "On a call, text me", 8),
    ("Arjun Kapoor", "A200", "star", None, 4300),
]
ASHA, ROHAN, MEERA, KABIR, ANANYA, DEV, PRIYA, ARJUN = range(8)


def L(who: int, text: str, reply: int | None = None, react: tuple = ()) -> tuple:
    """One scripted line: speaker, text, index of the line it replies to,
    and (user, emoji) reactions."""
    return who, text, reply, react


# Each chat: members, minutes since its last message, how its tail is left
# for the demo, and the script.
#   tail = ("read",)            everything read
#          ("unread", user, n)  the last n messages from others are unread by user
#          ("delivered",)       the last message was delivered but not read
#          ("sent",)            the last message has not been delivered yet
DIRECT_CHATS = [
    ((ASHA, ROHAN), 6, ("unread", ASHA, 2), [
        L(ROHAN, "Are you free this Saturday?"),
        L(ASHA, "I think so, why?"),
        L(ROHAN, "Triund trek. Leaving at 5am, back by evening"),
        L(ASHA, "5am is a crime", react=((ROHAN, "😂"),)),
        L(ROHAN, "The sunrise is worth it, trust me"),
        L(ASHA, "Fine. Who else is coming?"),
        L(ROHAN, "Meera, Kabir and Dev so far"),
        L(ASHA, "Okay I'm in. What do I need to carry?"),
        L(ROHAN, "Water, a jacket and proper shoes. Not the white sneakers.", reply=7),
        L(ASHA, "They are proper shoes", react=((ROHAN, "👎"),)),
        L(ROHAN, "They were proper shoes in 2019"),
        L(ASHA, "I'll borrow my brother's then"),
        L(ROHAN, "Perfect. I made a group for it, check there"),
        L(ROHAN, "Also can you bring the speaker?"),
        L(ROHAN, "The small one, not the party one"),
    ]),
    ((ASHA, MEERA), 95, ("read",), [
        L(MEERA, "Did the electrician come?"),
        L(ASHA, "He came, looked at the switchboard, and left"),
        L(MEERA, "Without fixing it??"),
        L(ASHA, "He said he needs a part. Coming back tomorrow."),
        L(MEERA, "That's what he said last week", react=((ASHA, "😢"),)),
        L(ASHA, "I took his number this time"),
        L(MEERA, "Good. Also we are out of milk"),
        L(ASHA, "I'll pick some up on the way back"),
        L(MEERA, "And bread if you remember"),
        L(ASHA, "Milk and bread, got it", reply=8),
        L(MEERA, "You're the best", react=((ASHA, "❤️"),)),
        L(ASHA, "Home by 7"),
        L(MEERA, "Okay! Dinner is on me tonight"),
        L(ASHA, "Now that is good news", react=((MEERA, "😂"),)),
    ]),
    ((ASHA, KABIR), 240, ("delivered",), [
        L(KABIR, "Hey, do you still have the notes from the systems course?"),
        L(ASHA, "Somewhere on my laptop, yes"),
        L(KABIR, "Could you send the scheduling chapter? Interview on Friday"),
        L(ASHA, "Oh nice, which company?"),
        L(KABIR, "A fintech startup in Bangalore. Backend role."),
        L(ASHA, "That's great! You'll do well", react=((KABIR, "❤️"),)),
        L(KABIR, "Hope so. Their process has four rounds"),
        L(ASHA, "Four is a lot"),
        L(KABIR, "Tell me about it"),
        L(ASHA, "Found the notes. They're messy but complete"),
        L(KABIR, "Messy is fine, thank you so much", reply=9),
        L(ASHA, "Sending tonight once I'm home. Good luck for Friday!"),
    ]),
    ((ASHA, ANANYA), 30, ("sent",), [
        L(ANANYA, "Got a minute to look at the onboarding screens?"),
        L(ASHA, "Sure, send them over"),
        L(ANANYA, "Shared in the team group. Third frame is the one I'm unsure about"),
        L(ASHA, "The one with the two buttons?"),
        L(ANANYA, "Yes. Feels like too many choices on one screen"),
        L(ASHA, "I'd drop the secondary button and make it a text link"),
        L(ANANYA, "Hmm that could work", reply=5, react=((ASHA, "👍"),)),
        L(ASHA, "It keeps the main action obvious"),
        L(ANANYA, "Let me try it and send you a new version"),
        L(ASHA, "No rush"),
        L(ANANYA, "Updated. Have a look when you can"),
        L(ASHA, "Much cleaner. Ship it", react=((ANANYA, "❤️"),)),
        L(ASHA, "Are you joining standup tomorrow or still travelling?"),
    ]),
    ((ROHAN, DEV), 400, ("read",), [
        L(DEV, "Bro did you book the cab for Saturday"),
        L(ROHAN, "Booked. Tempo traveller, fits all of us"),
        L(DEV, "How much per head?"),
        L(ROHAN, "Around 900 if everyone shows up"),
        L(DEV, "And if Kabir cancels like last time", react=((ROHAN, "😂"),)),
        L(ROHAN, "Then 1100 and we never invite him again"),
        L(DEV, "Fair"),
        L(ROHAN, "Pickup is 4:45 from your place"),
        L(DEV, "4:45. In the morning. Understood.", reply=7),
        L(ROHAN, "Set three alarms"),
        L(DEV, "Setting five"),
    ]),
    ((PRIYA, ARJUN), 4400, ("read",), [
        L(PRIYA, "Can you cover the client call on Thursday?"),
        L(ARJUN, "What time?"),
        L(PRIYA, "3pm. I have a dentist appointment I've moved twice already"),
        L(ARJUN, "Sure. Anything I should know?"),
        L(PRIYA, "They'll ask about the export feature. Timeline is end of month."),
        L(ARJUN, "End of month, got it", reply=4),
        L(PRIYA, "And don't promise dark mode", react=((ARJUN, "😂"),)),
        L(ARJUN, "I would never"),
        L(PRIYA, "You did last quarter"),
        L(ARJUN, "That was a different Arjun"),
        L(PRIYA, "Thank you, I owe you one", react=((ARJUN, "👍"),)),
    ]),
]

# (name, colour, admin, other members, minutes since last message, tail, script)
GROUP_CHATS = [
    ("Weekend Trek", "A130", ROHAN, (ASHA, MEERA, KABIR, DEV), 3, ("unread", ASHA, 4), [
        L(ROHAN, "Alright, Triund this Saturday. Everyone confirmed?"),
        L(MEERA, "Confirmed!"),
        L(DEV, "In"),
        L(KABIR, "90% in"),
        L(ROHAN, "Kabir.", reply=3, react=((DEV, "😂"), (MEERA, "😂"))),
        L(KABIR, "Okay okay, 100%"),
        L(ASHA, "I'm in too. Rohan bullied me into it"),
        L(ROHAN, "Encouraged."),
        L(MEERA, "What's the weather looking like?"),
        L(DEV, "Clear till afternoon, light rain after 4"),
        L(ROHAN, "Which is why we start early"),
        L(ASHA, "How long is the climb?"),
        L(ROHAN, "About 4 hours up, 3 down, with breaks", reply=11),
        L(MEERA, "I'll bring sandwiches for everyone", react=((ASHA, "❤️"), (KABIR, "❤️"), (DEV, "👍"))),
        L(KABIR, "I'll handle chai at the top"),
        L(DEV, "I have a first aid kit and a power bank"),
        L(ASHA, "I'll bring the speaker and bad music"),
        L(ROHAN, "Cab is booked. Pickup starts 4:45"),
        L(MEERA, "4:45?!", react=((ASHA, "😮"),)),
        L(ROHAN, "Yes. Sleep early."),
        L(KABIR, "Nobody is sleeping early"),
        L(DEV, "Splitting the cab comes to about 900 each"),
        L(MEERA, "Sent you my share Rohan"),
        L(ROHAN, "Got it, thanks Meera"),
        L(KABIR, "Sending mine tonight"),
        L(DEV, "Don't forget ID cards, there's a checkpoint"),
    ]),
    ("Flat 4B", "A160", MEERA, (ASHA, PRIYA), 130, ("unread", ASHA, 1), [
        L(MEERA, "Rent is due on the 5th, sharing the split"),
        L(MEERA, "Rent 14k each, electricity 1,150 each, wifi 400 each"),
        L(PRIYA, "Electricity went up again?"),
        L(MEERA, "AC season", reply=2),
        L(ASHA, "That's my fault, sorry", react=((PRIYA, "😂"),)),
        L(PRIYA, "We know"),
        L(ASHA, "Paid my share"),
        L(MEERA, "Received, thanks"),
        L(PRIYA, "Paying tomorrow morning, salary day"),
        L(MEERA, "No problem"),
        L(ASHA, "The electrician is coming back tomorrow for the switchboard"),
        L(PRIYA, "Finally. The kitchen light has been flickering for a week"),
        L(MEERA, "Someone needs to be home between 11 and 1"),
        L(PRIYA, "I'm working from home, I'll let him in", react=((MEERA, "👍"), (ASHA, "👍"))),
        L(ASHA, "Thank you!"),
        L(MEERA, "Also whose turn is it to order the water cans?"),
        L(ASHA, "Mine. Ordering now."),
        L(PRIYA, "Maid is on leave Thursday and Friday btw"),
        L(MEERA, "Noted. Dishes rota for those two days?"),
        L(ASHA, "I'll take Thursday"),
        L(PRIYA, "Friday is mine then"),
        L(MEERA, "Perfect. Dinner tonight is on me, be home by 8"),
    ]),
    ("Design Team", "A140", ANANYA, (ASHA, DEV, ARJUN, PRIYA), 18, ("unread", ASHA, 3), [
        L(ANANYA, "Onboarding v3 is up in the shared file"),
        L(ARJUN, "Looking now"),
        L(PRIYA, "The illustrations are lovely", react=((ANANYA, "❤️"),)),
        L(DEV, "Frame 3 has two primary buttons, is that intended?"),
        L(ANANYA, "No, fixing that. Asha suggested a text link instead", reply=3),
        L(ASHA, "It keeps one clear action per screen"),
        L(ARJUN, "Agree. The spacing on frame 5 looks tight on small phones"),
        L(ANANYA, "Good catch, I'll add a breakpoint"),
        L(DEV, "From the dev side, the progress dots need to be tappable?"),
        L(ANANYA, "No, display only"),
        L(DEV, "Great, that saves me a day", react=((ASHA, "😂"), (PRIYA, "👍"))),
        L(PRIYA, "Client call is Thursday 3pm. Arjun is covering for me"),
        L(ARJUN, "I'll present v3 if it's ready"),
        L(ANANYA, "It will be ready by Wednesday evening"),
        L(ASHA, "I can review the copy tomorrow morning"),
        L(ANANYA, "That would help a lot", reply=14),
        L(PRIYA, "Reminder: they'll ask about the export feature"),
        L(ARJUN, "End of month. I've been briefed."),
        L(DEV, "Export is on track. API is done, UI is half way"),
        L(PRIYA, "Nice"),
        L(ANANYA, "Standup moved to 10:30 tomorrow, travelling in the morning"),
        L(ARJUN, "Works for me"),
        L(DEV, "Same"),
        L(PRIYA, "Asha can you bring the printed mockups?"),
    ]),
]


def _timestamps(rng: random.Random, count: int, ends_at: datetime) -> list[datetime]:
    """Realistic chat rhythm, counted back from the last message: mostly
    replies within minutes, occasionally a gap of hours."""
    stamps = [ends_at]
    for _ in range(count - 1):
        if rng.random() < 0.18:
            gap = timedelta(hours=rng.randint(3, 26), minutes=rng.randint(0, 59))
        else:
            gap = timedelta(minutes=rng.randint(1, 6), seconds=rng.randint(0, 59))
        stamps.append(stamps[-1] - gap)
    return list(reversed(stamps))


def _add_script(db: Db, rng: random.Random, conv: Conversation, users: list[User],
                script: list[tuple], ends_at: datetime) -> list[Message]:
    """Create the scripted messages, fully delivered and read."""
    member_user_ids = [m.user_id for m in conv.members]
    saved: list[Message] = []
    for (who, text, reply, reactions), at in zip(script, _timestamps(rng, len(script), ends_at)):
        sender = users[who]
        msg = Message(conversation_id=conv.id, sender_id=sender.id, type="text", body=text,
                      reply_to_id=saved[reply].id if reply is not None else None,
                      created_at=at)
        seen_at = at + timedelta(seconds=40)
        msg.receipts = [MessageReceipt(user_id=uid, delivered_at=at, read_at=seen_at)
                        for uid in member_user_ids if uid != sender.id]
        msg.reactions = [Reaction(user_id=users[user].id, emoji=emoji, created_at=seen_at)
                         for user, emoji in reactions]
        db.add(msg)
        db.flush()
        saved.append(msg)
    conv.last_message_at = saved[-1].created_at
    return saved


def _apply_tail(messages: list[Message], users: list[User], tail: tuple) -> None:
    """Leave the end of a chat unread, undelivered or delivered-only so that
    every badge and check mark has something to show."""
    kind = tail[0]
    if kind == "unread":
        reader = users[tail[1]].id
        from_others = [m for m in messages if m.sender_id != reader]
        for msg in from_others[-tail[2]:]:
            for receipt in msg.receipts:
                if receipt.user_id == reader:
                    receipt.read_at = None
    elif kind in ("delivered", "sent"):
        for receipt in messages[-1].receipts:
            receipt.read_at = None
            if kind == "sent":
                receipt.delivered_at = None


def _set_read_markers(conv: Conversation, messages: list[Message]) -> None:
    """Each member's marker is the last message before their first unread one."""
    for member in conv.members:
        marker = None
        for msg in messages:
            mine = next((r for r in msg.receipts if r.user_id == member.user_id), None)
            if mine is not None and mine.read_at is None:
                break
            marker = msg.id
        member.last_read_message_id = marker


def seed_if_empty(db: Db) -> bool:
    """Seed the demo data unless the database already has users."""
    if db.scalar(select(func.count(User.id))):
        return False
    rng = random.Random(7)
    now = utcnow()

    users = []
    for index, (name, color, preset, about, seen_ago) in enumerate(USERS):
        users.append(User(phone=f"+91900000000{index + 1}", display_name=name, about=about,
                          avatar_color=color, avatar_preset=preset, is_demo=True,
                          last_seen_at=now - timedelta(minutes=seen_ago),
                          created_at=now - timedelta(days=30)))
    db.add_all(users)
    db.flush()

    db.add_all(Contact(owner_id=owner.id, contact_id=other.id)
               for owner in users for other in users if owner is not other)

    for (a, b), ends_ago, tail, script in DIRECT_CHATS:
        first, second = users[a], users[b]
        low, high = sorted((first.id, second.id))
        conv = Conversation(type="direct", created_by=first.id, direct_key=f"{low}:{high}")
        conv.members = [ConversationMember(user_id=first.id),
                        ConversationMember(user_id=second.id)]
        db.add(conv)
        db.flush()
        messages = _add_script(db, rng, conv, users, script, now - timedelta(minutes=ends_ago))
        _apply_tail(messages, users, tail)
        _set_read_markers(conv, messages)

    for name, color, admin, others, ends_ago, tail, script in GROUP_CHATS:
        owner = users[admin]
        conv = Conversation(type="group", name=name, avatar_color=color, created_by=owner.id)
        conv.members = [ConversationMember(user_id=owner.id, role="admin")] + [
            ConversationMember(user_id=users[index].id) for index in others]
        db.add(conv)
        db.flush()
        # The "created the group" line has to get the lowest id in the chat,
        # so it is saved before the script and back-dated afterwards.
        created = Message(conversation_id=conv.id, type="system",
                          body=f"{owner.display_name} created the group")
        db.add(created)
        db.flush()
        messages = _add_script(db, rng, conv, users, script, now - timedelta(minutes=ends_ago))
        created.created_at = messages[0].created_at - timedelta(minutes=2)
        for member in conv.members:
            member.joined_at = created.created_at
        _apply_tail(messages, users, tail)
        _set_read_markers(conv, messages)

    db.flush()
    return True
