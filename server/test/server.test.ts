import { describe, expect, test, beforeAll, beforeEach } from '@jest/globals';
import { Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import ClientToServerEvents from '../../common/ClientToServerEvents';
import Room, { RoomState } from '../../common/Room';
import ServerToClientEvents from '../../common/ServerToClientEvents';
import { io, rooms } from '../src/server';

jest.mock('crypto', () => {
    return {
        randomBytes: jest.fn(() =>
            Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x09, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16]),
        ),
        randomInt: jest.fn(() => 0),
    };
});

describe('sprintna.me websocket server', () => {
    let clientSocket: ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    beforeEach((done) => {
        io.listen(3000);
        clientSocket = ioClient(`http://localhost:${3000}`);
        clientSocket.on('connect', done);
    });

    afterEach(() => {
        clientSocket.close();
        io.close();
    });

    describe('room:create', () => {
        test('should return room to client', (done) => {
            clientSocket.emit('room:create', 'my room', (room) => {
                expect(room).toEqual({
                    id: 'AQIDBAUGCRAREhMUFRY',
                    state: RoomState.SELECTING,
                    name: 'my room',
                    users: [clientSocket.id],
                    choices: {},
                });
                done();
            });
        });

        test('should create room on server', (done) => {
            clientSocket.emit('room:create', 'my room', (room) => {
                expect(rooms).toEqual({
                    AQIDBAUGCRAREhMUFRY: {
                        id: 'AQIDBAUGCRAREhMUFRY',
                        state: RoomState.SELECTING,
                        name: 'my room',
                        users: [clientSocket.id],
                        choices: {},
                    },
                });
                done();
            });
        });

        test('should join client to room', (done) => {
            clientSocket.emit('room:create', 'my room', (room) => {
                expect(io.sockets.sockets.get(clientSocket.id)?.rooms).toEqual(
                    new Set([clientSocket.id, 'AQIDBAUGCRAREhMUFRY']),
                );
                done();
            });
        });
    });

    describe('room:join', () => {
        let roomId: string;

        beforeEach(() => {
            roomId = 'ABCDEF';
            rooms[roomId] = {
                id: roomId,
                state: RoomState.SELECTING,
                name: 'a very cool room',
                users: [],
                choices: {},
            };
        });

        test('should return room to client', (done) => {
            clientSocket.emit('room:join', roomId, (room) => {
                expect(room).toEqual({
                    id: roomId,
                    state: RoomState.SELECTING,
                    name: 'a very cool room',
                    users: [clientSocket.id],
                    choices: {},
                });
                done();
            });
        });

        test('should join client to room', (done) => {
            clientSocket.emit('room:join', roomId, (room) => {
                expect(io.sockets.sockets.get(clientSocket.id)?.rooms).toEqual(new Set([clientSocket.id, roomId]));
                done();
            });
        });

        test('should update user list of room', (done) => {
            clientSocket.emit('room:join', roomId, (room) => {
                expect(rooms[roomId].users).toEqual([clientSocket.id]);
                done();
            });
        });

        test('should emit room:users:update', (done) => {
            clientSocket.on('room:users:update', (id, users) => {
                expect(id).toEqual(roomId);
                expect(users).toEqual([clientSocket.id]);
                done();
            });

            clientSocket.emit('room:join', roomId, () => {});
        });
    });

    describe('room:album:select', () => {
        let roomId: string;

        beforeEach(() => {
            roomId = 'ABCDEF';
            rooms[roomId] = {
                id: roomId,
                state: RoomState.SELECTING,
                name: 'a very cool room',
                users: [],
                choices: {},
            };

            io.sockets.sockets.get(clientSocket.id)?.join(roomId);
        });

        describe('room.state is SELECTING', () => {
            beforeEach(() => {
                rooms[roomId].state = RoomState.SELECTING;
            });

            test('should set users choice in room', (done) => {
                clientSocket.emit('room:album:select', roomId, 'abcdef123', () => {
                    expect(rooms[roomId].choices).toEqual({
                        [clientSocket.id]: {
                            choice: 'abcdef123',
                            eliminated: false,
                            user: clientSocket.id,
                        },
                    });
                    done();
                });
            });

            test('should emit room:choices:update', (done) => {
                clientSocket.on('room:choices:update', (id, choices) => {
                    expect(id).toEqual(roomId);
                    expect(choices).toEqual({
                        [clientSocket.id]: {
                            choice: 'abcdef123',
                            eliminated: false,
                            user: clientSocket.id,
                        },
                    });
                    done();
                });

                clientSocket.emit('room:album:select', roomId, 'abcdef123', () => {});
            });
        });

        describe('room.state is not SELECTING', () => {
            beforeEach(() => {
                rooms[roomId].state = RoomState.ELIMINATING;
            });

            test('should not set users choice in room', (done) => {
                clientSocket.emit('room:album:select', roomId, 'abcdef123', () => {
                    expect(rooms[roomId].choices).toEqual({});
                    done();
                });
            });

            test.skip('should not emit room:choices:update', () => {
                clientSocket.on('room:choices:update', () => {});

                clientSocket.emit('room:album:select', roomId, 'abcdef123', () => {});
            });
        });
    });

    describe('room:album:eliminate', () => {
        let roomId: string;

        beforeEach(() => {
            roomId = 'ABCDEF';
            rooms[roomId] = {
                id: roomId,
                state: RoomState.SELECTING,
                name: 'a very cool room',
                users: ['123', '456', clientSocket.id],
                choices: {
                    '123': { user: '123', choice: 'abc', eliminated: false },
                    '456': { user: '456', choice: 'def', eliminated: false },
                    [clientSocket.id]: { user: clientSocket.id, choice: 'ghi', eliminated: false },
                },
            };

            io.sockets.sockets.get(clientSocket.id)?.join(roomId);
        });

        describe('room.state is ELIMINATING', () => {
            beforeEach(() => {
                rooms[roomId].state = RoomState.ELIMINATING;
            });

            test('should emit room:ablum:eliminated', (done) => {
                clientSocket.on('room:album:eliminated', (id, eliminated) => {
                    expect(id).toEqual(roomId);
                    expect(eliminated).toEqual({ user: '123', choice: 'abc', eliminated: true });
                    done();
                });

                clientSocket.emit('room:album:eliminate', roomId, () => {});
            });

            // fails if it does call
            test.skip('should not change room state when more than one album remains', (done) => {
                clientSocket.on('room:state:update', (id, state) => {
                    expect(id).toEqual(roomId);
                    expect(state).toEqual(RoomState.FINISHED);
                    done();
                });

                clientSocket.emit('room:album:eliminate', roomId, () => {});
            });

            test('should emit room:state:update when only one album remains', (done) => {
                rooms[roomId].choices['456'].eliminated = true;

                clientSocket.on('room:state:update', (id, state) => {
                    expect(id).toEqual(roomId);
                    expect(state).toEqual(RoomState.FINISHED);
                    done();
                });

                clientSocket.emit('room:album:eliminate', roomId, () => {});
            });

            test('should change room state to FINISHED when only one album remains', (done) => {
                rooms[roomId].choices['456'].eliminated = true;

                clientSocket.emit('room:album:eliminate', roomId, () => {
                    expect(rooms[roomId].state).toEqual(RoomState.FINISHED);
                    done();
                });
            });
        });
    });

    describe('room:proceed', () => {
        let roomId: string;

        beforeEach(() => {
            roomId = 'ABCDEF';
            rooms[roomId] = {
                id: roomId,
                state: RoomState.SELECTING,
                name: 'a very cool room',
                users: ['123', '456', clientSocket.id],
                choices: {
                    '123': { user: '123', choice: 'abc', eliminated: false },
                    '456': { user: '456', choice: 'def', eliminated: false },
                    [clientSocket.id]: { user: clientSocket.id, choice: 'ghi', eliminated: false },
                },
            };

            io.sockets.sockets.get(clientSocket.id)?.join(roomId);
        });

        test('should change from SELECTING to ELIMINATING', (done) => {
            rooms[roomId].state = RoomState.SELECTING;
            clientSocket.emit('room:proceed', roomId, () => {
                expect(rooms[roomId].state).toEqual(RoomState.ELIMINATING);
                done();
            });
        });

        test('should emit room:state:update when SELECTING', (done) => {
            rooms[roomId].state = RoomState.SELECTING;
            clientSocket.on('room:state:update', (id, state) => {
                expect(id).toEqual(roomId);
                expect(state).toEqual(RoomState.ELIMINATING);
                done();
            });

            clientSocket.emit('room:proceed', roomId, () => {});
        });

        test('should not change from ELIMINATING', (done) => {
            rooms[roomId].state = RoomState.ELIMINATING;
            clientSocket.emit('room:proceed', roomId, () => {
                expect(rooms[roomId].state).toEqual(RoomState.ELIMINATING);
                done();
            });
        });

        test('should not change from FINISHED', (done) => {
            rooms[roomId].state = RoomState.FINISHED;
            clientSocket.emit('room:proceed', roomId, () => {
                expect(rooms[roomId].state).toEqual(RoomState.FINISHED);
                done();
            });
        });
    });
});
