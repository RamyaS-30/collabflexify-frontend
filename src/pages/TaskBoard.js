import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import io from 'socket.io-client';

const backendUrl = process.env.REACT_APP_BACKEND_URL;
const socket = io(backendUrl);

const STATUSES = ['To Do', 'In Progress', 'Completed'];

function TaskBoard({ workspaceId, user }) {
  const [lists, setLists] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
  if (!workspaceId) return;

  setLists(null);
  setLoading(true);

  fetch(`${backendUrl}/api/taskboard/${workspaceId}`)
    .then((res) => {
      if (!res.ok) throw new Error('Failed to fetch taskboard');
      return res.json();
    })
    .then((data) => {
      const existingLists = data.lists || [];
      const listsByStatus = {};

      STATUSES.forEach((status) => {
        listsByStatus[status] =
          existingLists.find((list) => list.title === status) || {
            id: `list-${status.toLowerCase().replace(/\s/g, '-')}`,
            title: status,
            tasks: [],
          };
      });

      existingLists.forEach((list) => {
        list.tasks.forEach((task) => {
          const taskStatus = task.status || 'To Do';
          if (listsByStatus[taskStatus]) {
            if (!listsByStatus[taskStatus].tasks.some((t) => t.id === task.id)) {
              listsByStatus[taskStatus].tasks.push(task);
            }
          }
        });
      });

      setLists(Object.values(listsByStatus));
      setLoading(false);
    })
    .catch((err) => {
      console.error(err);
      setLoading(false);
    });
}, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    
    const handleUpdate = (updatedLists) => {
      const listsByStatus = {};
      STATUSES.forEach((status) => {
        listsByStatus[status] =
          updatedLists.find((list) => list.title === status) || {
            id: `list-${status.toLowerCase().replace(/\s/g, '-')}`,
            title: status,
            tasks: [],
          };
      });
    
      updatedLists.forEach((list) => {
        list.tasks.forEach((task) => {
          const taskStatus = task.status || 'To Do';
          if (listsByStatus[taskStatus]) {
            if (!listsByStatus[taskStatus].tasks.some((t) => t.id === task.id)) {
              listsByStatus[taskStatus].tasks.push(task);
            }
          }
        });
      });

    setLists(Object.values(listsByStatus));
  };

  socket.emit('joinRoom', workspaceId);
  socket.on('taskboard:update', handleUpdate);

  return () => {
    socket.emit('leaveRoom', workspaceId);
    socket.off('taskboard:update', handleUpdate);
  };
}, [workspaceId]);

  const updateTaskboard = async (newLists) => {
    try {
      const res = await fetch(`${backendUrl}/api/taskboard/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists: newLists }),
      });
      if (!res.ok) throw new Error('Failed to update taskboard');
    } catch (err) {
      console.error(err);
    }
  };

  const createTaskboard = async () => {
    const initialLists = [
      {
        id: `list-to-do`,
        title: 'To Do',
        tasks: [],
      },
    ];
    setLists(initialLists);
    await updateTaskboard(initialLists);
  };

  const addNewTask = async () => {
    if (!newTaskTitle.trim()) return;
    if (!lists) return;

    // Always add new task to "To Do" list
    const toDoListIndex = lists.findIndex((list) => list.title === 'To Do');
    if (toDoListIndex === -1) {
      alert('No To Do list found!');
      return;
    }

    const newTask = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      status: 'To Do',
    };

    const newLists = [...lists];
    newLists[toDoListIndex] = {
      ...newLists[toDoListIndex],
      tasks: [...newLists[toDoListIndex].tasks, newTask],
    };

    setLists(newLists);
    setNewTaskTitle('');
    await updateTaskboard(newLists);
  };

  // Change task status and move it to appropriate list
  const changeTaskStatus = async (task, fromListTitle, newStatus) => {
    if (newStatus === fromListTitle) return; // no change

    const newLists = lists.map((list) => {
      // Remove task from old list
      if (list.title === fromListTitle) {
        return {
          ...list,
          tasks: list.tasks.filter((t) => t.id !== task.id),
        };
      }
      return list;
    });

    // Add task to new list with updated status
    const targetListIndex = newLists.findIndex((l) => l.title === newStatus);
    if (targetListIndex === -1) {
      // If no such list exists, create it
      newLists.push({
        id: `list-${newStatus.toLowerCase().replace(/\s/g, '-')}`,
        title: newStatus,
        tasks: [{ ...task, status: newStatus }],
      });
    } else {
      newLists[targetListIndex] = {
        ...newLists[targetListIndex],
        tasks: [...newLists[targetListIndex].tasks, { ...task, status: newStatus }],
      };
    }

    setLists(newLists);
    await updateTaskboard(newLists);
  };

  const onDragEnd = async (result) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === 'LIST') {
      const newLists = Array.from(lists);
      const [movedList] = newLists.splice(source.index, 1);
      newLists.splice(destination.index, 0, movedList);
      setLists(newLists);
      await updateTaskboard(newLists);
      return;
    }

    if (type === 'TASK') {
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      const sourceListIndex = lists.findIndex(
        (list) => list.id === source.droppableId
      );
      const destListIndex = lists.findIndex(
        (list) => list.id === destination.droppableId
      );

      const sourceList = lists[sourceListIndex];
      const destList = lists[destListIndex];

      const sourceTasks = Array.from(sourceList.tasks);
      const [movedTask] = sourceTasks.splice(source.index, 1);

      if (source.droppableId === destination.droppableId) {
        sourceTasks.splice(destination.index, 0, movedTask);
        const newLists = Array.from(lists);
        newLists[sourceListIndex] = { ...sourceList, tasks: sourceTasks };
        setLists(newLists);
        await updateTaskboard(newLists);
      } else {
        // When moving between lists, update task status to dest list title
        movedTask.status = destList.title;

        const destTasks = Array.from(destList.tasks);
        destTasks.splice(destination.index, 0, movedTask);

        const newLists = Array.from(lists);
        newLists[sourceListIndex] = { ...sourceList, tasks: sourceTasks };
        newLists[destListIndex] = { ...destList, tasks: destTasks };
        setLists(newLists);
        await updateTaskboard(newLists);
      }
    }
  };

  if (loading) return <div>Loading taskboard...</div>;

  if (!lists || lists.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="mb-4 text-gray-700">No taskboard found.</p>
        <button
          onClick={createTaskboard}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Taskboard
        </button>
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="all-lists" direction="horizontal" type="LIST">
          {(provided) => (
            <div
              className="flex space-x-4 overflow-x-auto"
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {lists.map((list, index) => (
                <Draggable draggableId={list.id} index={index} key={list.id}>
                  {(provided) => (
                    <div
                      className="bg-gray-100 p-4 rounded-md w-80 flex-shrink-0"
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                    >
                      <h3
                        {...provided.dragHandleProps}
                        className="font-bold mb-2 text-center"
                      >
                        {list.title}
                      </h3>
                      <Droppable droppableId={list.id} type="TASK">
                        {(provided) => (
                          <div
                            className="min-h-[100px]"
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                          >
                            {list.tasks.map((task, idx) => (
                              <Draggable
                                key={task.id}
                                draggableId={task.id}
                                index={idx}
                              >
                                {(provided) => (
                                  <div
                                    className="bg-white p-2 mb-2 rounded shadow flex justify-between items-center"
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                  >
                                    <span>{task.title}</span>
                                    <select
                                      value={task.status || list.title}
                                      onChange={async (e) => {
                                        await changeTaskStatus(
                                          task,
                                          list.title,
                                          e.target.value
                                        );
                                      }}
                                      className="border border-gray-300 rounded px-1"
                                    >
                                      {STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                          {status}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new task input and button */}
      <div className="flex items-center mt-4 mb-6">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="New task"
          className="border border-gray-300 rounded px-2 py-1 mr-2 flex-grow"
          onKeyDown={(e) => {
            if (e.key === 'Enter') addNewTask();
          }}
        />
        <button
          onClick={addNewTask}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Task
        </button>
      </div>
    </>
  );
}

export default TaskBoard;