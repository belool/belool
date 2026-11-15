#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "OZGameMode.generated.h"

class AOZCharacter;
class AOZGrenade;

USTRUCT()
struct FOZKillEntry
{
	GENERATED_BODY()
	FString Killer; FString Victim; FString Weapon;
	int32 KillerTeam = -1; int32 VictimTeam = 0;
	bool bHeadshot = false; bool bKillerIsPlayer = false; bool bVictimIsPlayer = false;
	float Time = 0.f;
};

USTRUCT()
struct FOZNoise
{
	GENERATED_BODY()
	FVector Location = FVector::ZeroVector;
	float Radius = 0.f;
	float Time = 0.f;
	TWeakObjectPtr<AOZCharacter> Source;
};

USTRUCT()
struct FOZRadio
{
	GENERATED_BODY()
	FString From; FString Text; float Time = 0.f;
};

// ================================================================
// Mata-mata em equipes 5x5 contra bots (primeira a 50 abates):
// constrói o mapa, distribui equipes, controla renascimento, placar,
// feed de abates, explosões, ruídos (audição da IA) e conhecimento
// compartilhado de inimigos por equipe (comunicação dos esquadrões).
// ================================================================
UCLASS()
class OPERATIONZERO_API AOZGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AOZGameMode();
	virtual void StartPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// utilitários estáticos usados pelos sistemas
	static TArray<AOZCharacter*> Characters(const UObject* Ctx);
	static void Explode(const UObject* Ctx, const FVector& Where, float Radius, float Damage, AOZCharacter* ByCharacter);
	static void ReportNoise(const UObject* Ctx, const FVector& Location, float Radius, AOZCharacter* Source);
	static void OnGrenadeThrown(const UObject* Ctx, AOZGrenade* Grenade);
	static AOZGameMode* Get(const UObject* Ctx);

	void OnKilled(AOZCharacter* Victim, AOZCharacter* Killer, FName WeaponId, bool bHeadshot, bool bExplosive, float Dist);
	void OnDamaged(AOZCharacter* Victim, AOZCharacter* Attacker);
	void OnNearMiss(AOZCharacter* Victim, AOZCharacter* Shooter);
	void ReportEnemy(int32 Team, AOZCharacter* Enemy, const FVector& Where, AOZCharacter* Reporter);
	bool KnownEnemy(int32 Team, FVector& OutPos, float MaxAge = 10.f) const;
	void Radio(AOZCharacter* From, const FString& Text, bool bImportant = false);
	FVector SpawnPointFor(int32 Team) const;

	int32 Scores[2] = { 0, 0 };
	int32 ScoreLimit = 50;
	float TimeLeft = 600.f;
	bool bMatchOver = false;
	int32 WinnerTeam = -1;
	TArray<FOZKillEntry> KillFeed;
	TArray<FOZNoise> Noises;
	TArray<FOZRadio> RadioLog;
	TArray<TWeakObjectPtr<AOZGrenade>> Grenades;
	TArray<FVector> Spawns[2];
	TArray<FVector> StrategicPoints;

protected:
	void SpawnBot(int32 Team, int32 Index);
	struct FRespawn { TWeakObjectPtr<AOZCharacter> C; float T; };
	TArray<FRespawn> Respawns;
	struct FKnown { TWeakObjectPtr<AOZCharacter> Enemy; FVector Pos; float Time; };
	TArray<FKnown> Known[2];
	float EndTimer = 0.f;
	float LastRadio = -10.f;
};
