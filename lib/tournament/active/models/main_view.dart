class MainView {
  final int entries;
  final int reentries;
  final int addons;
  final int playersIn;
  final int playersBusted;
  final int seatedCount;
  final int waitingCount;
  final int currentLevel;
  final DateTime? levelEndsAt;
  final DateTime lastEventAt;

  MainView({
    required this.entries,
    required this.reentries,
    required this.addons,
    required this.playersIn,
    required this.playersBusted,
    required this.seatedCount,
    required this.waitingCount,
    required this.currentLevel,
    this.levelEndsAt,
    required this.lastEventAt,
  });

  factory MainView.fromMap(Map<String, dynamic> map) {
    return MainView(
      entries: map['entries'] ?? 0,
      reentries: map['reentries'] ?? 0,
      addons: map['addons'] ?? 0,
      playersIn: map['playersIn'] ?? 0,
      playersBusted: map['playersBusted'] ?? 0,
      seatedCount: map['seatedCount'] ?? 0,
      waitingCount: map['waitingCount'] ?? 0,
      currentLevel: map['currentLevel'] ?? 1,
      levelEndsAt: map['levelEndsAt'] != null 
          ? DateTime.parse(map['levelEndsAt']) 
          : null,
      lastEventAt: DateTime.parse(map['lastEventAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'entries': entries,
      'reentries': reentries,
      'addons': addons,
      'playersIn': playersIn,
      'playersBusted': playersBusted,
      'seatedCount': seatedCount,
      'waitingCount': waitingCount,
      'currentLevel': currentLevel,
      'levelEndsAt': levelEndsAt?.toIso8601String(),
      'lastEventAt': lastEventAt.toIso8601String(),
    };
  }

  MainView copyWith({
    int? entries,
    int? reentries,
    int? addons,
    int? playersIn,
    int? playersBusted,
    int? seatedCount,
    int? waitingCount,
    int? currentLevel,
    DateTime? levelEndsAt,
    DateTime? lastEventAt,
  }) {
    return MainView(
      entries: entries ?? this.entries,
      reentries: reentries ?? this.reentries,
      addons: addons ?? this.addons,
      playersIn: playersIn ?? this.playersIn,
      playersBusted: playersBusted ?? this.playersBusted,
      seatedCount: seatedCount ?? this.seatedCount,
      waitingCount: waitingCount ?? this.waitingCount,
      currentLevel: currentLevel ?? this.currentLevel,
      levelEndsAt: levelEndsAt ?? this.levelEndsAt,
      lastEventAt: lastEventAt ?? this.lastEventAt,
    );
  }
}
