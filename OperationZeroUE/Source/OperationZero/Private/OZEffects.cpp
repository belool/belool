#include "OZEffects.h"
#include "OZShapes.h"
#include "OZTypes.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "EngineUtils.h"
#include "Engine/World.h"

static const int32 MaxParticles = 2500;
static const int32 MaxDecals = 300;

AOZEffects::AOZEffects()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostPhysics;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

AOZEffects* AOZEffects::Get(const UObject* WorldContext)
{
	UWorld* W = WorldContext ? WorldContext->GetWorld() : nullptr;
	if (!W) return nullptr;
	for (TActorIterator<AOZEffects> It(W); It; ++It) return *It;
	FActorSpawnParameters P; P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AOZEffects* E = W->SpawnActor<AOZEffects>(AOZEffects::StaticClass(), FTransform::Identity, P);
	if (!E) return nullptr;
	auto MakeISM = [E](OZShapes::EShape Shape, const FLinearColor& Color, bool bShadow) {
		UInstancedStaticMeshComponent* C = NewObject<UInstancedStaticMeshComponent>(E);
		C->SetStaticMesh(OZShapes::Mesh(Shape));
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetCastShadow(bShadow);
		C->SetMobility(EComponentMobility::Movable);
		C->SetupAttachment(E->GetRootComponent());
		if (UMaterialInstanceDynamic* M = OZShapes::Material(C, Color)) C->SetMaterial(0, M);
		C->RegisterComponent();
		return C;
	};
	E->Pools.Add(EOZParticle::Spark, MakeISM(OZShapes::EShape::Cube, FLinearColor(6.f, 3.5f, 1.f), false));
	E->Pools.Add(EOZParticle::Fire, MakeISM(OZShapes::EShape::Sphere, FLinearColor(8.f, 2.5f, 0.4f), false));
	E->Pools.Add(EOZParticle::Smoke, MakeISM(OZShapes::EShape::Sphere, FLinearColor(0.35f, 0.35f, 0.35f), false));
	E->Pools.Add(EOZParticle::Dust, MakeISM(OZShapes::EShape::Sphere, FLinearColor(0.3f, 0.26f, 0.2f), false));
	E->Pools.Add(EOZParticle::Blood, MakeISM(OZShapes::EShape::Sphere, FLinearColor(0.35f, 0.01f, 0.01f), false));
	E->Pools.Add(EOZParticle::Debris, MakeISM(OZShapes::EShape::Cube, FLinearColor(0.25f, 0.24f, 0.22f), true));
	E->Pools.Add(EOZParticle::Casing, MakeISM(OZShapes::EShape::Cylinder, FLinearColor(0.6f, 0.45f, 0.12f), false));
	E->Tracers = MakeISM(OZShapes::EShape::Cube, FLinearColor(10.f, 7.f, 2.5f), false);
	E->Decals = MakeISM(OZShapes::EShape::Cylinder, FLinearColor(0.01f, 0.01f, 0.01f), false);
	for (int32 i = 0; i < 4; i++)
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(E);
		L->SetupAttachment(E->GetRootComponent());
		L->SetIntensity(0.f);
		L->SetCastShadows(false);
		L->SetMobility(EComponentMobility::Movable);
		L->RegisterComponent();
		E->Lights.Add(L);
		E->LightTime.Add(0.f); E->LightDur.Add(0.1f); E->LightPeak.Add(0.f);
	}
	return E;
}

void AOZEffects::Spawn(EOZParticle Kind, const FVector& Pos, const FVector& Vel, float Life, float Size, float Gravity, float Drag, float Grow)
{
	if (Particles.Num() >= MaxParticles) Particles.RemoveAtSwap(FMath::RandRange(0, Particles.Num() - 1));
	FOZParticle P;
	P.Kind = Kind; P.Pos = Pos; P.Vel = Vel; P.Life = Life; P.MaxLife = Life; P.Size = Size; P.Gravity = Gravity; P.Drag = Drag; P.Grow = Grow;
	P.Rot = FRotator(FMath::FRandRange(0, 360), FMath::FRandRange(0, 360), 0);
	if (Kind == EOZParticle::Debris || Kind == EOZParticle::Casing) P.Spin = FRotator(FMath::FRandRange(-600, 600), FMath::FRandRange(-600, 600), FMath::FRandRange(-600, 600));
	Particles.Add(P);
}

void AOZEffects::Tracer(const FVector& A, const FVector& B)
{
	const FVector D = B - A;
	const float L = D.Size();
	if (L < 1.f) return;
	TracerQueue.Add(FTransform(D.Rotation(), (A + B) * 0.5f, FVector(L / 100.f, 0.012f, 0.012f)));
}

void AOZEffects::Impact(const FVector& Point, const FVector& Normal, FName Material)
{
	const bool bSpark = Material == "metal" || Material == "sheetmetal";
	for (int32 i = 0; i < 6; i++)
		Spawn(EOZParticle::Dust, Point, Normal * FMath::FRandRange(150, 450) + FMath::VRand() * 150.f, FMath::FRandRange(0.3f, 0.7f), FMath::FRandRange(3, 7), 900.f, 1.5f);
	Spawn(EOZParticle::Smoke, Point + Normal * 5.f, Normal * 60.f + FVector(0, 0, 30), 0.9f, 15.f, -20.f, 2.f, 60.f);
	if (bSpark) for (int32 i = 0; i < 6; i++)
		Spawn(EOZParticle::Spark, Point, Normal * FMath::FRandRange(300, 800) + FMath::VRand() * 300.f, FMath::FRandRange(0.1f, 0.3f), 2.f, 1200.f, 1.f);
	if (Material != "glass") Decal(Point, Normal, bSpark ? 5.f : 7.f);
}

void AOZEffects::Blood(const FVector& Point, const FVector& Dir, float Amount)
{
	for (int32 i = 0; i < 8 * Amount; i++)
		Spawn(EOZParticle::Blood, Point, Dir * FMath::FRandRange(100, 300) + FMath::VRand() * 120.f, FMath::FRandRange(0.3f, 0.7f), FMath::FRandRange(3, 8), 900.f, 2.f);
}

void AOZEffects::Muzzle(const FVector& Point, const FVector& Dir, float Scale)
{
	for (int32 i = 0; i < 5; i++)
		Spawn(EOZParticle::Fire, Point + Dir * (i * 4.f * Scale), Dir * 300.f + FMath::VRand() * 80.f, 0.05f, FMath::FRandRange(6, 12) * Scale);
	Spawn(EOZParticle::Smoke, Point, Dir * 80.f + FVector(0, 0, 30), 0.6f, 8.f, -30.f, 1.f, 60.f);
	Flash(Point, FLinearColor(1.f, 0.7f, 0.35f), 4000.f * Scale, 800.f, 0.05f);
}

void AOZEffects::Explosion(const FVector& Point, float Radius)
{
	for (int32 i = 0; i < 40; i++)
		Spawn(EOZParticle::Fire, Point + FVector(0, 0, 30), FMath::VRand() * FMath::FRandRange(100, Radius * 2.5f) + FVector(0, 0, 200), FMath::FRandRange(0.2f, 0.55f), FMath::FRandRange(30, 90), 300.f, 3.f, 200.f);
	for (int32 i = 0; i < 30; i++)
		Spawn(EOZParticle::Smoke, Point + FMath::VRand() * 100.f, FMath::VRand() * Radius * 0.8f + FVector(0, 0, FMath::FRandRange(100, 400)), FMath::FRandRange(1.5f, 3.5f), FMath::FRandRange(80, 160), -40.f, 1.5f, 120.f);
	for (int32 i = 0; i < 25; i++)
		Spawn(EOZParticle::Spark, Point, FMath::VRand() * FMath::FRandRange(800, 2200) + FVector(0, 0, 600), FMath::FRandRange(0.4f, 1.1f), 4.f, 1400.f, 0.5f);
	Flash(Point + FVector(0, 0, 100), FLinearColor(1.f, 0.55f, 0.2f), 200000.f, Radius * 4.f, 0.35f);
	Decal(FVector(Point.X, Point.Y, Point.Z + 1.f), FVector::UpVector, Radius * 0.5f);
}

void AOZEffects::Debris(const FVector& Center, const FVector& Size, FName Material)
{
	const int32 N = FMath::Clamp((int32)(Size.X * Size.Y * Size.Z / 150000.f) + 6, 6, 24);
	for (int32 i = 0; i < N; i++)
	{
		const FVector P = Center + FVector(FMath::FRandRange(-0.5f, 0.5f) * Size.X, FMath::FRandRange(-0.5f, 0.5f) * Size.Y, FMath::FRandRange(-0.5f, 0.5f) * Size.Z);
		Spawn(EOZParticle::Debris, P, FVector(FMath::FRandRange(-400, 400), FMath::FRandRange(-400, 400), FMath::FRandRange(100, 600)), FMath::FRandRange(5.f, 9.f), FMath::FRandRange(8, 30), 1800.f, 0.2f);
	}
	for (int32 i = 0; i < 10; i++)
		Spawn(EOZParticle::Dust, Center + FMath::VRand() * 50.f, FMath::VRand() * 120.f, FMath::FRandRange(1.f, 2.5f), FMath::FRandRange(60, 120), -10.f, 1.f, 80.f);
}

void AOZEffects::Casing(const FVector& Point, const FVector& Right)
{
	Spawn(EOZParticle::Casing, Point, Right * FMath::FRandRange(200, 350) + FVector(0, 0, FMath::FRandRange(150, 300)), 2.5f, 1.2f, 1200.f, 0.f);
}

void AOZEffects::Flash(const FVector& Point, const FLinearColor& Color, float Intensity, float Radius, float Duration)
{
	int32 Best = 0;
	for (int32 i = 0; i < Lights.Num(); i++) if (LightTime[i] < LightTime[Best]) Best = i;
	UPointLightComponent* L = Lights[Best];
	L->SetWorldLocation(Point);
	L->SetLightColor(Color);
	L->SetAttenuationRadius(Radius);
	LightTime[Best] = Duration; LightDur[Best] = Duration; LightPeak[Best] = Intensity;
	L->SetIntensity(Intensity);
}

void AOZEffects::Decal(const FVector& Point, const FVector& Normal, float Size)
{
	const FRotator R = FRotationMatrix::MakeFromZ(Normal).Rotator();
	const FTransform T(R, Point + Normal * 0.4f, FVector(Size / 100.f, Size / 100.f, 0.004f));
	if (Decals->GetInstanceCount() < MaxDecals) Decals->AddInstance(T, true);
	else Decals->UpdateInstanceTransform(DecalIndex++ % MaxDecals, T, true, true);
}

void AOZEffects::Tick(float Dt)
{
	Super::Tick(Dt);
	// traçantes: refeitos a cada quadro
	Tracers->ClearInstances();
	for (const FTransform& T : TracerQueue) Tracers->AddInstance(T, true);
	TracerQueue.Reset();
	// partículas (simulação simples na CPU)
	for (int32 i = Particles.Num() - 1; i >= 0; i--)
	{
		FOZParticle& P = Particles[i];
		P.Life -= Dt;
		if (P.Life <= 0.f) { Particles.RemoveAtSwap(i); continue; }
		P.Vel *= FMath::Exp(-P.Drag * Dt);
		P.Vel.Z -= P.Gravity * Dt;
		P.Pos += P.Vel * Dt;
		if (P.Pos.Z < 1.f && (P.Kind == EOZParticle::Debris || P.Kind == EOZParticle::Casing || P.Kind == EOZParticle::Blood || P.Kind == EOZParticle::Dust))
		{
			P.Pos.Z = 1.f; P.Vel.Z *= -0.3f; P.Vel.X *= 0.7f; P.Vel.Y *= 0.7f; P.Spin *= 0.6f;
		}
		P.Size += P.Grow * Dt;
		P.Rot += P.Spin * Dt;
	}
	for (auto& Pair : Pools) Pair.Value->ClearInstances();
	for (const FOZParticle& P : Particles)
	{
		const float Fade = FMath::Min(1.f, P.Life / P.MaxLife * 2.5f);
		float S = P.Size * (P.Kind == EOZParticle::Smoke || P.Kind == EOZParticle::Fire ? Fade : 1.f) / 100.f;
		FVector Scale(S);
		if (P.Kind == EOZParticle::Casing) Scale = FVector(0.012f, 0.012f, 0.03f);
		Pools[P.Kind]->AddInstance(FTransform(P.Rot, P.Pos, Scale), true);
	}
	for (int32 i = 0; i < Lights.Num(); i++)
	{
		if (LightTime[i] > 0.f) { LightTime[i] -= Dt; Lights[i]->SetIntensity(LightPeak[i] * FMath::Max(0.f, LightTime[i] / LightDur[i])); }
		else if (Lights[i]->Intensity > 0.f) Lights[i]->SetIntensity(0.f);
	}
}
