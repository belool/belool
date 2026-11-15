#include "OZBlock.h"
#include "OZShapes.h"
#include "OZTypes.h"
#include "OZEffects.h"
#include "OZSound.h"
#include "OZGameMode.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

AOZBlock::AOZBlock()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	Mesh->SetCanEverAffectNavigation(true);
}

void AOZBlock::Setup(const FVector& Size, FName InMaterial, float InHealth, bool bInExplosive, bool bInExplosiveOnly, const FLinearColor* Tint)
{
	BoxSize = Size; MaterialName = InMaterial; Health = MaxHealth = InHealth; bExplosive = bInExplosive; bExplosiveOnly = bInExplosiveOnly;
	Mesh->SetStaticMesh(OZShapes::Mesh(OZShapes::EShape::Cube));
	Mesh->SetWorldScale3D(Size / 100.f);
	Mesh->ComponentTags.Add(InMaterial);
	BaseColor = Tint ? *Tint : OZMaterials::Color(InMaterial);
	Mat = OZShapes::Material(this, BaseColor);
	if (Mat) Mesh->SetMaterial(0, Mat);
}

bool AOZBlock::TakeHit(float Damage, bool bIsExplosive, AOZCharacter* ByCharacter)
{
	if (bBroken || (bExplosiveOnly && !bIsExplosive)) return false;
	Health -= Damage;
	if (Health > 0.f)
	{
		// dano parcial: escurece
		if (Mat && MaterialName != "glass") Mat->SetVectorParameterValue(TEXT("Color"), BaseColor * FMath::Max(0.35f, Health / MaxHealth));
		return false;
	}
	bBroken = true;
	const FVector C = GetActorLocation();
	if (AOZEffects* FX = AOZEffects::Get(this)) FX->Debris(C, BoxSize, MaterialName);
	OZSound::Play(this, OZSound::EKind::Impact, C, MaterialName == "glass" ? 2.f : 0.5f, 1.2f);
	SetActorEnableCollision(false);
	Mesh->SetVisibility(false);
	if (bExplosive) AOZGameMode::Explode(this, C, 700.f, 130.f, ByCharacter);
	SetLifeSpan(0.1f);
	return true;
}
