export const EventTypes = [
    {value: "Enter", label: "用户进入"},
    {value: "Like", label: "用户点赞"},
    {value: "Comment", label: "用户评论"},
    {value: "Gift", label: "用户打赏"},
] as const;

export const eventTypeToLabel = (type: string) => {
    const event = EventTypes.find(item => item.value === type);
    return event ? event.label : type;
};
