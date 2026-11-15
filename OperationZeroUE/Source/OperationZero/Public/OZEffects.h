#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OZEffects.generated.h"

class UInstancedStaticMeshComponent;
class UPointLightComponent;

// ================================================================
// Efeitos visuais sem assets: traçantes, faíscas, poeira, fumaça,
// sangue, destroços com física simples, marcas de bala e clarões.
// Tudo com instâncias (InstancedStaticMesh), poucas draw calls.
// ================================================================
UENUM()
enum class EOZParticle : uint8 { Spark, Smoke, Dust, Blood, Debris, Casing, Fire };

USTRUCT()
struct FOZParticle
{
	GENERATED_BODY()
	FVector Pos = FVector::ZeroVector;
	FVector Vel = FVector::ZeroVector;
	float Life = 1.f;
	float MaxLife = 1.f;
	float Size = 5.f;
	float Grow = 0.f;
	float Gravity = 0.f;
	float Drag = 0.f;
	FRotator Rot = FRotator::ZeroRotator;
	FRotator Spin = FRotator::ZeroRotator;
	EOZParticle Kind = EOZParticle::Dust;
};

UCLASS()
class OPERATIONZERO_API AOZEffects : public AActor
{
	GENERATED_BODY()

public:
	AOZEffects();
	virtual void Tick(float DeltaSeconds) override;

	static AOZEffects* Get(const UObject* WorldContext);

	void Tracer(const FVector& A, const FVector& B);
	void Impact(const FVector& Point, const FVector& Normal, FName Material);
	void Blood(const FVector& Point, const FVector& Dir, float Amount = 1.f);
	void Muzzle(const FVector& Point, const FVector& Dir, float Scale = 1.f);
	void Explosion(const FVector& Point, float Radius);
	void Debris(const FVector& Center, const FVector& Size, FName Material);
	void Casing(const FVector& Point, const FVector& Right);
	void Flash(const FVector& Point, const FLinearColor& Color, float Intensity, float Radius, float Duration);

protected:
	void Spawn(EOZParticle Kind, const FVector& Pos, const FVector& Vel, float Life, float Size, float Gravity = 0.f, float Drag = 0.f, float Grow = 0.f);
	void Decal(const FVector& Point, const FVector& Normal, float Size);

	UPROPERTY() TMap<EOZParticle, UInstancedStaticMeshComponent*> Pools;
	UPROPERTY() UInstancedStaticMeshComponent* Tracers;
	UPROPERTY() UInstancedStaticMeshComponent* Decals;
	UPROPERTY() TArray<UPointLightComponent*> Lights;

	TArray<FOZParticle> Particles;
	TArray<FTransform> TracerQueue;
	TArray<float> LightTime;
	TArray<float> LightDur;
	TArray<float> LightPeak;
	int32 DecalIndex = 0;
};
